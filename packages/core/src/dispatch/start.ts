/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { isObject } from 'smob';
import { AGENT_CHANNEL_NAME } from '../channel/constants.ts';
import type { DispatchResult } from '../channel/types.ts';
import { inject } from '../context/module.ts';
import { currentToolCall } from '../effect/frame.ts';
import { stableHash } from '../effect/helpers.ts';
import { InvalidRunStateError, ValidationError } from '../errors/index.ts';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';
import { DEFAULT_DISPATCH_ROLE, DISPATCH_CONTEXT } from './constants.ts';
import {
    assertDispatchKey,
    claimKey,
    findDispatchRole,
    maxDepthOf,
    maxPerRunOf,
    readChildren,
    readCount,
    runSnapshotOf,
    validatePayload,
} from './helpers.ts';
import type { DispatchHost, DispatchInput, DispatchRunSnapshot } from './types.ts';

/** Appends `childId` to `dispatch-children:<runId>` (once); called under the run's serial chain. */
async function recordChild(host: DispatchHost, runId: string, childId: string): Promise<void> {
    const key = `dispatch-children:${runId}`;
    const runIds = readChildren((await host.effects.findOne(key))?.result);

    if (!runIds.includes(childId)) {
        await host.effects.save(key, { runIds: [...runIds, childId] });
    }
}

async function start(
    name: string,
    ctx: ToolContext<any>,
    input: DispatchInput,
    resolveTarget: (run: DispatchRunSnapshot) => string,
): Promise<DispatchResult> {
    const frame = currentToolCall();

    if (!frame) {
        throw new InvalidRunStateError(`${name} runs inside a tool call, not in the tools factory.`);
    }

    // the engine's copy, never ctx.run itself: tool code can write to that
    const run = runSnapshotOf(ctx?.run);

    if (!run || run.runId !== frame.runId) {
        throw new InvalidRunStateError(`${name} got the context of another run than the tool call it runs in.`);
    }

    const host = inject(ctx, DISPATCH_CONTEXT);

    if (!isObject(input)) {
        throw new ValidationError(`${name} needs an input object.`);
    }

    if (input.payload === undefined) {
        throw new ValidationError(`${name} needs a payload.`);
    }

    if (input.role !== undefined && (typeof input.role !== 'string' || input.role.length === 0)) {
        throw new ValidationError('The dispatch role must be a non-empty string.');
    }

    assertDispatchKey('idempotency key', input.idempotencyKey, false);
    assertDispatchKey('concurrency key', input.concurrencyKey, true);
    assertDispatchKey('address', input.address, true);

    const target = resolveTarget(run);
    const role = input.role ?? DEFAULT_DISPATCH_ROLE;
    const agent = host.getAgent(target);
    const subscription = agent ? findDispatchRole(agent, role) : undefined;

    if (!subscription) {
        throw new ValidationError(`Agent "${target}" has no dispatch role "${role}": add agent.on({ role: '${role}' }) to its channels.`);
    }

    const maxPerRun = maxPerRunOf(target, subscription);
    const maxDepth = maxDepthOf(target, subscription);
    const depth = (run.parent?.kind === 'dispatch' ? run.parent.depth : 0) + 1;

    if (depth > maxDepth) {
        throw new ValidationError(`Agent "${target}" role "${role}" accepts dispatches up to depth ${maxDepth}.`);
    }

    const payload = await validatePayload(target, role, subscription.options.schema as StandardSchemaV1 | undefined, input.payload);
    const concurrencyKey = input.concurrencyKey ?? subscription.concurrencyKey?.(payload);

    assertDispatchKey('concurrency key', concurrencyKey, true);

    const given = input.idempotencyKey ?? subscription.idempotencyKey?.(payload);

    assertDispatchKey('idempotency key', given, false);

    const { address } = input;
    const key = claimKey(given ?? `${run.runId}:${stableHash({
        agent: target,
        role,
        payload,
        concurrencyKey,
        address,
    })}`);
    const callHash = stableHash({
        agent: target,
        role,
        payload,
        key,
        concurrencyKey,
        address,
    });
    const effectKey = `${run.runId}:dispatch:${callHash}`;

    // looked up and registered without an await in between, so identical calls share one
    const pending = host.inflight.get(effectKey);

    if (pending) {
        return pending;
    }

    // runs under serial(runId): the children record is a read-check-write
    const create = async (): Promise<DispatchResult> => {
        const { invoker } = run;
        const result = await host.createRun({
            agent: target,
            trigger: role,
            channel: AGENT_CHANNEL_NAME,
            payload,
            idempotencyKey: key,
            ...(concurrencyKey !== undefined ? { concurrencyKey } : {}),
            ...(address !== undefined ? { address } : {}),
            ...(invoker ? { invoker: { ...invoker, permissions: [...invoker.permissions] } } : {}),
        }, {
            kind: 'dispatch',
            runId: run.runId,
            agent: run.agent,
            role,
            depth,
        });
        const value: DispatchResult = { runId: result.runId, deduplicated: result.deduplicated };

        // the child exists: a failing record must not fail the call (createRun dedupes a redo)
        try {
            await recordChild(host, run.runId, value.runId);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('[chamvi] recording a dispatched run failed', error);
        }

        try {
            await host.effects.save(effectKey, value);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('[chamvi] recording a dispatch failed', error);
        }

        return value;
    };

    const promise = (async (): Promise<DispatchResult> => {
        const recorded = await host.effects.findOne(effectKey);

        if (recorded) {
            return recorded.result as DispatchResult;
        }

        return host.serial(run.runId, async (): Promise<DispatchResult> => {
            // again behind the run's earlier calls: one of them may have recorded it meanwhile
            const again = await host.effects.findOne(effectKey);

            if (again) {
                return again.result as DispatchResult;
            }

            const countKey = `dispatch-count:${run.runId}:${target}:${role}`;
            const stored = await host.effects.findOne(countKey);
            const { count, calls } = readCount(stored?.result);

            // a call that already spent its slot (its record lost) redoes the deduplicating dispatch
            if (calls.includes(callHash)) {
                return create();
            }

            if (count >= maxPerRun) {
                throw new ValidationError(
                    `Run ${run.runId} reached its ${maxPerRun} dispatches of agent "${target}" role "${role}" (agent.on({ maxPerRun })).`,
                );
            }

            // counted before the dispatch: a crash in between spends the call's slot, a redo reuses it
            await host.effects.save(countKey, { count: count + 1, calls: [...calls, callHash] });

            return create();
        });
    })();

    host.inflight.set(effectKey, promise);

    try {
        return await promise;
    } finally {
        if (host.inflight.get(effectKey) === promise) {
            host.inflight.delete(effectKey);
        }
    }
}

/**
 * Starts a run of the calling run's own agent through its `agent.on()` role
 * (`input.role`, default `default`): channel `agent`, the parent's invoker,
 * `trigger.parent` naming this run. Effect-recorded per run and call, and
 * deduplicated across runs by the idempotency key (`dispatch:<key>`), so a
 * second run dispatching the same key gets the first child
 * (`deduplicated: true`). The role's `maxDepth` bounds the child's depth
 * (a root run has depth 0), and a run starts at most `maxPerRun` dispatches
 * of one role over all its executions.
 */
export async function dispatch<S extends StateSchema = StateSchema>(
    ctx: ToolContext<S>,
    input: DispatchInput,
): Promise<DispatchResult> {
    return start('dispatch()', ctx, input, (run) => run.agent);
}
