/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { buildIssuesForStandardSchemaIssues } from '@validup/standard-schema';
import { isObject } from 'smob';
import { NAME_MAX_LENGTH, NAME_PATTERN } from '../agent/constants.ts';
import type { Agent } from '../agent/types.ts';
import { AGENT_CHANNEL_NAME } from '../channel/constants.ts';
import { assertChannelName } from '../channel/helpers.ts';
import type { ChannelSubscription } from '../channel/types.ts';
import { InvalidAgentDefinitionError, ValidationError } from '../errors/index.ts';
import { RunStatus } from '../run/constants.ts';
import type { Run, RunContext, Usage } from '../run/types.ts';
import { describeIssues } from '../state/helpers.ts';
import { TRIGGER_KEY_MAX_LENGTH } from '../trigger/constants.ts';
import type { Invoker, TriggerParent } from '../trigger/types.ts';
import {
    DEFAULT_DISPATCH_MAX_DEPTH,
    DEFAULT_MAX_DISPATCHES_PER_RUN,
    DISPATCH_DEPTH_MAX,
} from './constants.ts';
import type {
    DispatchHost,
    DispatchOutcome,
    DispatchRunSnapshot,
    DispatchWaitRecord,
} from './types.ts';

/** The agent's `agent.on()` subscription for `role` (channel `agent`, id = role), if any. */
export function findDispatchRole(agent: Agent, role: string): ChannelSubscription | undefined {
    return agent.definition.channels?.find((s) => s.channel === AGENT_CHANNEL_NAME && s.id === role);
}

/** Whether the agent declares any `agent.on()` role (a subscription to channel `agent`). */
export function declaresDispatchRole(agent: Agent): boolean {
    return agent.definition.channels?.some((s) => s.channel === AGENT_CHANNEL_NAME) ?? false;
}

/** `maxPerRun` or its default; InvalidAgentDefinitionError for a value that is no positive safe integer. */
export function checkMaxPerRun(label: string, value: unknown): number {
    if (value === undefined) {
        return DEFAULT_MAX_DISPATCHES_PER_RUN;
    }

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new InvalidAgentDefinitionError(`${label}: maxPerRun must be a positive integer.`);
    }

    return value;
}

/** `maxDepth` or its default; InvalidAgentDefinitionError outside 1 to DISPATCH_DEPTH_MAX. */
export function checkMaxDepth(label: string, value: unknown): number {
    if (value === undefined) {
        return DEFAULT_DISPATCH_MAX_DEPTH;
    }

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > DISPATCH_DEPTH_MAX) {
        throw new InvalidAgentDefinitionError(`${label}: maxDepth must be an integer from 1 to ${DISPATCH_DEPTH_MAX}.`);
    }

    return value;
}

/** A copy of `from` (agent names); InvalidAgentDefinitionError for no array or an entry breaking the agent-name rule. */
export function checkFrom(label: string, value: unknown): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        throw new InvalidAgentDefinitionError(`${label}: from must be an array of agent names.`);
    }

    for (const entry of value) {
        if (typeof entry !== 'string' || entry.length > NAME_MAX_LENGTH || !NAME_PATTERN.test(entry)) {
            throw new InvalidAgentDefinitionError(
                `${label}: from entry "${String(entry)}" must match ${NAME_PATTERN} and be at most ${NAME_MAX_LENGTH} characters.`,
            );
        }
    }

    return [...value as string[]];
}

/** `description` as given; InvalidAgentDefinitionError for a value that is no non-empty string. */
export function checkDescription(label: string, value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string' || value.length === 0) {
        throw new InvalidAgentDefinitionError(`${label}: description must be a non-empty string.`);
    }

    return value;
}

function roleLabel(agent: string, role: string): string {
    return `Agent "${agent}" role "${role}"`;
}

/** The role's `maxPerRun`, re-checked (a subscription built by hand, or options changed after agent.on()). */
export function maxPerRunOf(agent: string, subscription: ChannelSubscription): number {
    return checkMaxPerRun(roleLabel(agent, subscription.id), (subscription.options as Record<string, unknown> | undefined)?.maxPerRun);
}

/** The role's `maxDepth`, re-checked like maxPerRunOf(). */
export function maxDepthOf(agent: string, subscription: ChannelSubscription): number {
    return checkMaxDepth(roleLabel(agent, subscription.id), (subscription.options as Record<string, unknown> | undefined)?.maxDepth);
}

/** The role's `from`, re-checked like maxPerRunOf() (undefined: only the own agent may dispatch). */
export function fromOf(agent: string, subscription: ChannelSubscription): string[] | undefined {
    return checkFrom(roleLabel(agent, subscription.id), (subscription.options as Record<string, unknown> | undefined)?.from);
}

/**
 * The stored run `runId` first, then its ancestors up `parentRunId` (at most
 * DISPATCH_DEPTH_MAX hops); stops at a run the store does not hold.
 */
export async function ancestorsOf(host: DispatchHost, runId: string): Promise<Run[]> {
    const chain: Run[] = [];
    let next: string | undefined = runId;

    while (next !== undefined && chain.length <= DISPATCH_DEPTH_MAX) {
        const run = await host.runs.findOne(next);

        if (!run) {
            break;
        }

        chain.push(run);
        next = run.parentRunId;
    }

    return chain;
}

/** Refuses an agent with an invalid role: id, `maxPerRun`, `maxDepth`, `from` or `description` (the engine's registration check). */
export function assertDispatchRoles(agent: Agent): void {
    for (const subscription of agent.definition.channels ?? []) {
        if (subscription.channel !== AGENT_CHANNEL_NAME) {
            continue;
        }

        assertChannelName(subscription.id);

        const label = roleLabel(agent.name, subscription.id);
        const options = subscription.options as Record<string, unknown> | undefined;

        checkMaxPerRun(label, options?.maxPerRun);
        checkMaxDepth(label, options?.maxDepth);
        checkFrom(label, options?.from);
        checkDescription(label, options?.description);
    }
}

/** `payload` parsed by `schema` (the parsed value); without one unchanged. */
export async function validatePayload(
    agent: string,
    role: string,
    schema: StandardSchemaV1 | undefined,
    payload: unknown,
): Promise<unknown> {
    if (!schema) {
        return payload;
    }

    const result = await schema['~standard'].validate(payload);

    if (result.issues) {
        const issues = buildIssuesForStandardSchemaIssues(result.issues);
        throw new ValidationError(`Invalid dispatch payload for agent "${agent}" role "${role}": ${describeIssues(issues)}`, issues);
    }

    return result.value;
}

/**
 * The idempotency key a dispatch claims: `dispatch:<role>:<key>` (the roles
 * of one agent share its claim scope), or `sha256:<hex>` of it above 255 characters.
 */
export function claimKey(role: string, key: string): string {
    const prefixed = `dispatch:${role}:${key}`;

    if (prefixed.length <= TRIGGER_KEY_MAX_LENGTH) {
        return prefixed;
    }

    return `sha256:${createHash('sha256').update(prefixed).digest('hex')}`;
}

/** A given key: a non-empty string without NUL (the idempotency key may be long, it is hashed). */
export function assertDispatchKey(name: string, value: unknown, bounded: boolean): asserts value is string | undefined {
    if (value === undefined) {
        return;
    }

    if (typeof value === 'string' && value.length > 0 && !value.includes('\0') &&
        (!bounded || value.length <= TRIGGER_KEY_MAX_LENGTH)) {
        return;
    }

    const bound = bounded ? ` of at most ${TRIGGER_KEY_MAX_LENGTH} characters` : '';
    throw new ValidationError(`The dispatch ${name} must be a non-empty string${bound} without NUL.`);
}

// the engine's copy of each execution's run, taken before any tool runs
const snapshots = new WeakMap<RunContext, DispatchRunSnapshot>();

function cloneInvoker(invoker: Invoker): Invoker {
    return {
        id: invoker.id,
        kind: invoker.kind,
        ...(invoker.name !== undefined ? { name: invoker.name } : {}),
        permissions: [...invoker.permissions],
    };
}

function cloneParent(parent: TriggerParent): TriggerParent {
    return {
        kind: parent.kind,
        runId: parent.runId,
        agent: parent.agent,
        role: parent.role,
        depth: parent.depth,
    };
}

/**
 * Keeps a frozen copy of the run's id, agent, invoker and parent for
 * dispatch(), so tool code that writes to `ctx.run` cannot pick another
 * agent, widen the invoker or drop the lineage.
 */
export function bindRunSnapshot(run: RunContext): void {
    const { invoker, parent } = run.trigger;

    snapshots.set(run, Object.freeze({
        runId: run.runId,
        agent: run.agent,
        ...(invoker ? { invoker: Object.freeze(cloneInvoker(invoker)) } : {}),
        ...(parent ? { parent: Object.freeze(cloneParent(parent)) } : {}),
    }));
}

/** The copy bindRunSnapshot() took for this run context (undefined for one the engine did not build). */
export function runSnapshotOf(run: RunContext | undefined): DispatchRunSnapshot | undefined {
    return run ? snapshots.get(run) : undefined;
}

/** The `dispatch-count:<runId>:<agent>:<role>` record: the slots spent and the calls (call hashes) they were spent on. */
export function readCount(value: unknown): { count: number, calls: string[] } {
    if (!isObject(value)) {
        return { count: 0, calls: [] };
    }

    const count = typeof value.count === 'number' ? value.count : 0;
    const calls = Array.isArray(value.calls) ? value.calls.filter((c): c is string => typeof c === 'string') : [];

    return { count, calls };
}

/** The `dispatch-children:<runId>` record: the ids of every run this run dispatched (deduplicated ones too). */
export function readChildren(value: unknown): string[] {
    if (!isObject(value) || !Array.isArray(value.runIds)) {
        return [];
    }

    return value.runIds.filter((id): id is string => typeof id === 'string');
}

/** The effect key of a dispatch wait's recorded outcomes. */
export function waitRecordKey(runId: string, waitId: string): string {
    return `dispatch-wait:${runId}:${waitId}`;
}

/** Whether a waited-on run has settled (`completed`, `failed` or `cancelled`). */
export function isSettled(run: Pick<Run, 'status'>): boolean {
    return run.status === RunStatus.COMPLETED || run.status === RunStatus.FAILED || run.status === RunStatus.CANCELLED;
}

/** A settled run's outcome (its role is the subscription id it was dispatched to). */
export function toDispatchOutcome(run: Run): DispatchOutcome {
    const status = run.status as DispatchOutcome['status'];

    return {
        runId: run.id,
        agent: run.agent,
        role: run.trigger.parent?.role ?? run.trigger.trigger,
        status,
        ...(status === RunStatus.COMPLETED && run.output !== undefined ? { output: run.output } : {}),
        ...(status !== RunStatus.COMPLETED && run.error ? { error: { code: run.error.code, message: run.error.message } } : {}),
    };
}

/**
 * The record of `runIds` (duplicates kept, in order) when every one of them
 * is settled in `runs`; undefined while one is not (or is missing).
 */
export function toWaitRecord(runIds: readonly string[], runs: readonly Run[]): DispatchWaitRecord | undefined {
    const byId = new Map(runs.map((run) => [run.id, run]));
    const outcomes: DispatchOutcome[] = [];
    const tainted: string[] = [];

    for (const id of runIds) {
        const run = byId.get(id);

        if (!run || !isSettled(run)) {
            return undefined;
        }

        outcomes.push(toDispatchOutcome(run));

        if (run.taint && !tainted.includes(id)) {
            tainted.push(id);
        }
    }

    return { outcomes, tainted };
}

/** A stored `dispatch-wait:` record (a malformed one reads as no outcomes). */
export function readWaitRecord(value: unknown): DispatchWaitRecord {
    if (!isObject(value)) {
        return { outcomes: [], tainted: [] };
    }

    return {
        outcomes: Array.isArray(value.outcomes) ? value.outcomes as DispatchOutcome[] : [],
        tainted: Array.isArray(value.tainted) ? value.tainted.filter((id): id is string => typeof id === 'string') : [],
    };
}

/**
 * The record of an expired wait on `runIds` (duplicates kept, in order): a
 * settled run keeps its outcome (a cancel the expiry made reads
 * `cancelled`), any other (still running, or missing) is `timeout` with `error`.
 */
export function toExpiredRecord(
    runIds: readonly string[],
    runs: readonly Run[],
    error: { code: string; message: string },
): DispatchWaitRecord {
    const byId = new Map(runs.map((run) => [run.id, run]));
    const outcomes: DispatchOutcome[] = [];
    const tainted: string[] = [];

    for (const id of runIds) {
        const run = byId.get(id);

        if (run && isSettled(run)) {
            outcomes.push(toDispatchOutcome(run));
        } else {
            outcomes.push({
                runId: id,
                agent: run?.agent ?? '',
                role: run ? run.trigger.parent?.role ?? run.trigger.trigger : '',
                status: 'timeout',
                error: { ...error },
            });
        }

        if (run?.taint && !tainted.includes(id)) {
            tainted.push(id);
        }
    }

    return { outcomes, tainted };
}

/**
 * The subtree usage of a run from its `children`: their usage plus their
 * own subtreeUsage, where `fresh` (a child's id and a total computed for it)
 * replaces that child's stored subtreeUsage.
 */
export function sumSubtreeUsage(children: readonly Run[], fresh?: { runId: string; usage: Usage }): Usage {
    const total: Usage = { inputTokens: 0, outputTokens: 0 };

    for (const child of children) {
        const below = fresh?.runId === child.id ? fresh.usage : child.subtreeUsage;

        total.inputTokens += child.usage.inputTokens + (below?.inputTokens ?? 0);
        total.outputTokens += child.usage.outputTokens + (below?.outputTokens ?? 0);
    }

    return total;
}
