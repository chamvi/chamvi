/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { requestApproval } from '../approval/request.ts';
import { currentToolCall } from '../effect/frame.ts';
import { stableHash } from '../effect/helpers.ts';
import { InvalidAgentDefinitionError, ToolDeniedError } from '../errors/index.ts';
import { hasToolContext } from '../tool/helpers.ts';
import type { ToolContext } from '../tool/types.ts';
import { runSource } from '../trust/module.ts';
import { assertLimitWeight, assertLimitedTools, assertToolLimit } from './asserts.ts';
import {
    formatLimitWindow,
    limitKeyOf,
    limitScopeOf,
    withLimitLock,
} from './helpers.ts';
import type {
    EnforceToolLimitInput,
    ToolLimit,
    ToolLimitCheck,
    ToolLimitOptions,
} from './types.ts';

/**
 * The limit check of one call, right before it executes: the weight
 * (`limit.weight`, default 1; else a ValidationError, nothing counted),
 * then under the lock `limit:<scope>` a call counted already passes, and
 * `used + weight <= max` records the use and passes. Over the limit, after
 * the lock is released: `deny` throws ToolDeniedError, `approve` asks for
 * an unordered bound approval (bound to the scope, the tool and the final
 * input; delivered to `source`, else the inbox only); approved records the
 * use without a re-check, denied throws ToolDeniedError.
 */
export async function enforceToolLimit(input: EnforceToolLimitInput): Promise<void> {
    const {
        name,
        limit,
        scope,
        final,
        ctx,
        key,
        service,
        locks,
        clock,
        source,
        signal,
    } = input;
    const weight = limit.weight ? await limit.weight(final, ctx) : 1;

    assertLimitWeight(name, weight);

    const used = await withLimitLock(locks, clock, scope, async () => {
        if (await service.counted(scope, key)) {
            return undefined;
        }

        const current = await service.used(scope);

        if (current + weight > limit.max) {
            return current;
        }

        await service.record(scope, key, weight, limit.windowMs);

        return undefined;
    }, signal);

    if (used === undefined) {
        return;
    }

    const window = formatLimitWindow(limit.windowMs);

    if (limit.onExceed === 'deny') {
        throw new ToolDeniedError(`Over the limit of ${name}: ${used} of ${limit.max} used in the last ${window}.`);
    }

    const body = await limit.detail?.(final, ctx);
    const decision = await requestApproval({
        title: `Limit reached for ${name}: ${used} of ${limit.max} used in the last ${window}. Allow this call?`,
        ...(body !== undefined ? { body } : {}),
        binding: stableHash({
            limit: scope,
            tool: name,
            input: final,
        }),
        unordered: true,
    }, source ?? {});

    if (!decision.approved) {
        throw new ToolDeniedError(`Over the limit of ${name} and not approved.`);
    }

    await service.record(scope, key, weight, limit.windowMs);
}

/** The tool's own limit (a chamvi tool's only), replaced whole by the agent's entry; false turns it off. */
function resolveToolLimit(name: string, def: ToolSet[string], options: ToolLimitOptions | undefined): ToolLimit | undefined {
    const own = hasToolContext(def) ? (def as { limit?: unknown }).limit : undefined;

    // a hand-built chamvi tool can carry an unchecked limit: refused like defineTool() refuses it
    assertToolLimit(own, name);

    const entry = options?.agent?.[name];

    if (entry === undefined) {
        return own;
    }

    return entry === false ? undefined : entry;
}

/**
 * The limit check of every limited executable tool of one execution, by
 * tool name. Throws InvalidAgentDefinitionError for an agent `limits` key
 * naming no tool of the set, a chamvi tool's malformed own `limit`, a
 * limited tool on an engine without a limit service, and tools sharing a
 * bucket with different `max` or `windowMs`.
 */
export function bindToolLimits(tools: ToolSet, ctx: ToolContext, options?: ToolLimitOptions): Map<string, ToolLimitCheck> {
    const checks = new Map<string, ToolLimitCheck>();
    const buckets = new Map<string, { tool: string; limit: ToolLimit }>();
    // the public ToolContext is mutable: the run is the execution's
    const { run } = ctx;

    assertLimitedTools(run.agent, options?.agent, tools);

    for (const [name, def] of Object.entries(tools)) {
        const limit = def.execute ? resolveToolLimit(name, def, options) : undefined;

        if (!limit) {
            continue;
        }

        const engine = options?.engine;
        const service = engine?.limitService;

        if (!engine || !service) {
            throw new InvalidAgentDefinitionError(`The limit of tool "${name}" needs an engine with a limit service.`);
        }

        const bucket = limit.bucket ?? name;
        const seen = buckets.get(bucket);

        if (seen && (seen.limit.max !== limit.max || seen.limit.windowMs !== limit.windowMs)) {
            throw new InvalidAgentDefinitionError(
                `The tools "${seen.tool}" and "${name}" share the limit bucket "${bucket}" with a different max or windowMs.`,
            );
        }

        buckets.set(bucket, { tool: name, limit });

        const scope = limitScopeOf(run.agent, bucket);

        checks.set(name, async (final) => {
            const frame = currentToolCall()!;
            const origin = runSource({ run });
            const source = origin?.address && engine.getChannel(origin.channel)?.out ?
                { channel: origin.channel, address: origin.address } :
                undefined;

            await enforceToolLimit({
                name,
                limit,
                scope,
                final,
                ctx,
                key: limitKeyOf(run.runId, frame.stepIndex, frame.toolCallId),
                service,
                locks: engine.lockService,
                clock: engine.clock,
                ...(source ? { source } : {}),
                signal: run.signal,
            });
        });
    }

    return checks;
}
