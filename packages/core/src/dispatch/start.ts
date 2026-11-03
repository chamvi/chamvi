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
import { BudgetExceededError, InvalidRunStateError, ValidationError } from '../errors/index.ts';
import { hasPermission } from '../permission/match.ts';
import type { Run, Usage } from '../run/types.ts';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';
import { DEFAULT_DISPATCH_ROLE, DISPATCH_CONTEXT } from './constants.ts';
import {
    ancestorsOf,
    assertDispatchKey,
    claimKey,
    findDispatchRole,
    fromOf,
    maxDepthOf,
    maxPerRunOf,
    readChildren,
    readCount,
    runSnapshotOf,
    sumSubtreeUsage,
    validatePayload,
} from './helpers.ts';
import type { DispatchHost, DispatchInput, DispatchToInput } from './types.ts';

/** Appends `childId` to `dispatch-children:<runId>` (once); called under the run's serial chain. */
async function recordChild(host: DispatchHost, runId: string, childId: string): Promise<void> {
    const key = `dispatch-children:${runId}`;
    const runIds = readChildren((await host.effects.findOne(key))?.result);

    if (!runIds.includes(childId)) {
        await host.effects.save(key, { runIds: [...runIds, childId] });
    }
}

/**
 * The first run of `chain` (the caller, then its ancestors) whose agent's
 * `budget.maxSubtreeTokens` its subtree usage reached, with that budget. The
 * totals along the chain are summed from the children read now (one read
 * per run up to the highest budget), each with the total just computed for
 * the chain's run below it, so a stored subtreeUsage left stale (a lost or
 * interleaved recompute) cannot let a dispatch through; a stored total above
 * the sum (it errs only low) counts instead.
 */
async function overSubtreeBudget(host: DispatchHost, chain: Run[]): Promise<{ run: Run, max: number } | undefined> {
    const budgets = chain.map((run) => host.getAgent(run.agent)?.definition.budget.maxSubtreeTokens);
    let last = -1;

    budgets.forEach((max, i) => {
        if (max !== undefined) {
            last = i;
        }
    });

    let fresh: { runId: string; usage: Usage } | undefined;

    for (let i = 0; i <= last; i++) {
        const run = chain[i]!;
        const { data } = await host.runs.find({ parentRunId: run.id });
        const summed = sumSubtreeUsage(data, fresh);
        const stored = run.subtreeUsage ?? { inputTokens: 0, outputTokens: 0 };
        // a recompute never overcounts: the stored total errs only low, so the larger one counts
        const usage = stored.inputTokens + stored.outputTokens > summed.inputTokens + summed.outputTokens ? stored : summed;
        const max = budgets[i];

        if (max !== undefined && usage.inputTokens + usage.outputTokens >= max) {
            return { run, max };
        }

        fresh = { runId: run.id, usage };
    }

    return undefined;
}

async function start(
    name: string,
    ctx: ToolContext<any>,
    input: DispatchInput,
    // undefined: the calling run's own agent (dispatch())
    targetAgent: (input: DispatchInput) => string | undefined,
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

    const target = targetAgent(input) ?? run.agent;
    const role = input.role ?? DEFAULT_DISPATCH_ROLE;
    const agent = host.getAgent(target);

    if (!agent) {
        throw new ValidationError(`Agent "${target}" is not registered.`);
    }

    const subscription = findDispatchRole(agent, role);

    if (!subscription) {
        throw new ValidationError(`Agent "${target}" has no dispatch role "${role}": add agent.on({ role: '${role}' }) to its channels.`);
    }

    const cross = target !== run.agent;

    if (cross && !(fromOf(target, subscription) ?? []).includes(run.agent)) {
        throw new ValidationError(`Agent "${target}" role "${role}" accepts no dispatches from agent "${run.agent}".`);
    }

    // the same permission http and MCP check (agentPermission(target, 'run')); a run without invoker passes
    const permission = `agent:${target}:run`;

    if (cross && run.invoker && !hasPermission(run.invoker.permissions, permission)) {
        throw new ValidationError(`The run's invoker may not run agent "${target}" (${permission}).`);
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

    // the stored runs (the snapshot holds no concurrency key or usage), read once per call. A child
    // under a key the chain holds is accepted: it queues until that run settled (fire and forget);
    // waitForDispatch() refuses to wait on it, since the wait would hold the key forever
    const chain = await ancestorsOf(host, run.runId);

    const given = input.idempotencyKey ?? subscription.idempotencyKey?.(payload);

    assertDispatchKey('idempotency key', given, false);

    const { address } = input;
    const key = claimKey(role, given ?? `${run.runId}:${stableHash({
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

        // a key claimed by the caller or a run up its lineage: waiting on it is a cycle nothing settles
        const cycle = value.deduplicated && chain.some((r) => r.id === value.runId);

        if (cycle) {
            throw new ValidationError(
                `The dispatch deduplicated into run ${value.runId}, the calling run or a run up its lineage, which it could never wait on.`,
            );
        }

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

            // a new call only: a recorded or redone one keeps its child however the subtree grew
            const over = await overSubtreeBudget(host, chain);

            if (over) {
                throw new BudgetExceededError(`Run ${over.run.id} reached its subtree token budget of ${over.max} tokens.`);
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
 * deduplicated across runs by the idempotency key (`dispatch:<role>:<key>`), so a
 * second run dispatching the same key gets the first child
 * (`deduplicated: true`). The role's `maxDepth` bounds the child's depth
 * (a root run has depth 0), and a run starts at most `maxPerRun` dispatches
 * of one role over all its executions.
 */
export async function dispatch<S extends StateSchema = StateSchema>(
    ctx: ToolContext<S>,
    input: DispatchInput,
): Promise<DispatchResult> {
    return start('dispatch()', ctx, input, () => undefined);
}

/**
 * Starts a run of `input.agent` through its `agent.on()` role, like
 * dispatch() (`input.agent` the calling run's own agent behaves exactly as
 * dispatch()). Another agent's role must list the caller in `from`, and a
 * run with an invoker needs `agent:<agent>:run` there; the child carries
 * that invoker unchanged. Every dispatch refuses a child whose agent and
 * concurrency key a run up its lineage holds, and once a run up the
 * lineage (or the caller) reached its agent's `budget.maxSubtreeTokens`.
 */
export async function dispatchTo<S extends StateSchema = StateSchema>(
    ctx: ToolContext<S>,
    input: DispatchToInput,
): Promise<DispatchResult> {
    return start('dispatchTo()', ctx, input, () => {
        const { agent } = input as { agent?: unknown };

        if (typeof agent !== 'string' || agent.length === 0) {
            throw new ValidationError('dispatchTo() needs an agent name.');
        }

        return agent;
    });
}
