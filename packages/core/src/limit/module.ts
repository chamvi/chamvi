/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolSet } from 'ai';
import { approvalDecisionKey, toApprovalDecision } from '../approval/helpers.ts';
import { requestApproval, unorderedApprovalId } from '../approval/request.ts';
import { currentToolCall } from '../effect/frame.ts';
import { stableHash } from '../effect/helpers.ts';
import { ToolDeniedError } from '../errors/index.ts';
import type { ToolContext } from '../tool/types.ts';
import { assertLimitWeight, assertLimitedTools } from './asserts.ts';
import {
    formatLimitWindow,
    limitKeyOf,
    limitMarkerKey,
    limitScopeOf,
    withLimitLock,
} from './helpers.ts';
import { limitApprovalTarget, resolveToolLimits } from './resolve.ts';
import type { EnforceToolLimitInput, ToolLimitCheck, ToolLimitOptions } from './types.ts';

/**
 * The limit check of one call, right before it executes: a call counted
 * before (its marker `limit:<scope>:<key>` in the run's effects) passes;
 * a recorded decision of the call's limit approval stands whatever the
 * count is now (denied throws); then the weight (`limit.weight`, default
 * 1; else a ValidationError, nothing counted); an approved call counts,
 * else under the lock `limit:<scope>`
 * `used + weight <= max` records the use and passes. Over the limit, after
 * the lock is released: `deny` throws ToolDeniedError, `approve` asks for
 * an unordered bound approval (bound to the scope, the tool and the final
 * input; delivered where `target` says, else the inbox only); approved records the
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
        target,
        signal,
    } = input;
    const frame = currentToolCall()!;
    const marker = limitMarkerKey(scope, key);

    // counted before (a replay after the tool's own approve(), a retried step): never checked again,
    // also once its use left the window or the purge deleted it
    if (await frame.effects.findOne(marker)) {
        return;
    }

    const binding = stableHash({
        limit: scope,
        tool: name,
        input: final,
    });
    // an answered limit approval stands, whatever the count is now (a drained window included)
    const recorded = await frame.effects.findOne(approvalDecisionKey(frame.runId, unorderedApprovalId(frame, binding)));

    if (recorded && !toApprovalDecision(recorded.result).approved) {
        throw new ToolDeniedError(`Over the limit of ${name} and not approved.`);
    }

    const weight = limit.weight ? await limit.weight(final, ctx) : 1;

    assertLimitWeight(name, weight);

    // the use first, then the marker: a crash in between records the use again, insert-if-absent
    const count = async () => {
        await service.record(scope, key, weight);
        await frame.effects.save(marker, true);
    };

    if (recorded) {
        await count();

        return;
    }

    const used = await withLimitLock(locks, clock, scope, async (assertHeld) => {
        // recorded before but its marker never landed (a crash, a failed marker write): counted, never checked again
        if (await service.has(scope, key)) {
            await frame.effects.save(marker, true);

            return undefined;
        }

        const current = await service.used(scope, limit.windowMs);

        if (current + weight > limit.max) {
            return current;
        }

        await assertHeld();
        await count();

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
    const { notification, ...destination } = await target?.() ?? {};
    const share = weight > 1 ? ` (this call: ${weight})` : '';
    const decision = await requestApproval({
        title: `Limit reached for ${name}: ${used} of ${limit.max} used in the last ${window}${share}. Allow this call?`,
        ...(body !== undefined ? { body } : {}),
        ...(notification !== undefined ? { notification } : {}),
        binding,
        unordered: true,
    }, destination);

    if (!decision.approved) {
        throw new ToolDeniedError(`Over the limit of ${name} and not approved.`);
    }

    await count();
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
    // the public ToolContext is mutable: the run is the execution's
    const { run } = ctx;
    const engine = options?.engine;

    assertLimitedTools(run.agent, options?.agent, tools);

    for (const [name, limit] of resolveToolLimits(tools, options?.agent, !!engine?.limitService)) {
        const scope = limitScopeOf(run.agent, limit.bucket ?? name);

        checks.set(name, async (final) => {
            const frame = currentToolCall()!;

            await enforceToolLimit({
                name,
                limit,
                scope,
                final,
                ctx,
                key: limitKeyOf(run.runId, frame.stepIndex, frame.toolCallId),
                service: engine!.limitService!,
                locks: engine!.lockService,
                clock: engine!.clock,
                target: () => limitApprovalTarget(engine!, run),
                signal: run.signal,
            });
        });
    }

    return checks;
}
