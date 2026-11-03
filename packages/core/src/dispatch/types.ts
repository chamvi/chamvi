/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { FlexibleSchema } from 'ai';
import type { Agent } from '../agent/types.ts';
import type { ChannelSubscription, DispatchResult } from '../channel/types.ts';
import type { DispatchEnvelope } from '../engine/types.ts';
import type { IEffectRepository, IRunRepository } from '../repository/types.ts';
import type { Invoker, TriggerParent } from '../trigger/types.ts';

export type AgentSubscriptionOptions<P = unknown> = {
    /** The role (the subscription id), following the channel-name rule; default `default`. */
    role?: string;
    /** Parses the payload a tool dispatches; the parsed value is the child's payload. */
    schema?: StandardSchemaV1<unknown, P>;
    /** How many dispatches of this role one run may start (all executions together), default 100. */
    maxPerRun?: number;
    /** The other agents whose runs may dispatch to this role (agent names); the own agent always may. */
    from?: string[];
    /** The deepest a run of this role may sit in a dispatch tree (a root run has depth 0), 1 to 8, default 1. */
    maxDepth?: number;
    /** Shared-store execution cap within the agent; omitted or false adds no cap. */
    concurrencyMaxRuns?: number | false;
    /** The child's concurrency key when the call gives none. */
    concurrencyKey?(payload: P): string | undefined;
    /** The child's idempotency key when the call gives none. */
    idempotencyKey?(payload: P): string | undefined;
    /** The child's address when the call gives none; deterministic (it feeds the dispatch's dedupe key). */
    address?(payload: P): string | undefined;
    /** What the role does, for a generated dispatch tool's description. */
    description?: string;
};

/** Makes a role of the `agent` channel (subscription id = role): the opt-in for dispatch(). */
export type AgentSubscriber = {
    on<P = unknown>(options?: AgentSubscriptionOptions<P>): ChannelSubscription<P>;
};

export type DispatchInput = {
    /** The receiving `agent.on()` role; default `default`. */
    role?: string;
    /** The child run's payload (required), parsed by the role's schema. */
    payload: unknown;
    /** Dedupes across runs: a second dispatch under the same key gets the first child. */
    idempotencyKey?: string;
    concurrencyKey?: string;
    /** The child's `trigger.address` (and `Run.address`). */
    address?: string;
};

/** dispatchTo()'s input: a dispatch to the `agent.on()` role of `agent`. */
export type DispatchToInput = DispatchInput & {
    /** The receiving agent (the calling run's own agent behaves as dispatch()). */
    agent: string;
};

/** How a dispatched run ended, as waitForDispatch() reports it. */
export type DispatchOutcome = {
    runId: string;
    agent: string;
    role: string;
    /** `timeout`: the wait expired on a run another run dispatched (it keeps running), or on one whose cancel did not land within one claim TTL. */
    status: 'completed' | 'failed' | 'cancelled' | 'timeout';
    /** A completed run's output. */
    output?: unknown;
    /** A failed or cancelled run's error (a wait that expired: code `Timeout`). */
    error?: { code: string; message: string };
};

export type DispatchWaitOptions = {
    /** How long the run waits before the wait expires; 1 to APPROVAL_TIMEOUT_MAX_MS, default 24 h. */
    timeoutMs?: number;
};

/** What `dispatch-wait:<runId>:<waitId>` records (internal): the outcomes in `runIds` order, the tainted run ids. */
export type DispatchWaitRecord = {
    outcomes: DispatchOutcome[];
    tainted: string[];
};

/** The engine's copy of a run dispatch() reads (internal). */
export type DispatchRunSnapshot = {
    readonly runId: string;
    readonly agent: string;
    readonly invoker?: Invoker;
    readonly parent?: TriggerParent;
};

/** The engine side of dispatch() (internal, provided under DISPATCH_CONTEXT). */
export type DispatchHost = {
    getAgent(name: string): Agent | undefined;
    effects: IEffectRepository;
    runs: Pick<IRunRepository, 'findOne' | 'find'>;
    /** Creates the run with `parent` as its lineage (engine.dispatch() never sets one). */
    createRun(envelope: DispatchEnvelope, parent: TriggerParent): Promise<DispatchResult>;
    /** Runs `fn` after every earlier call of the same run settled (the count and children read-check-write). */
    serial<T>(runId: string, fn: () => Promise<T>): Promise<T>;
    /** Dispatches in flight by effect key, so identical parallel calls share one. */
    inflight: Map<string, Promise<DispatchResult>>;
};

/**
 * A role schema as a generated tool's input: the AI SDK schema the model
 * sees and validates against, and how a validated input becomes the payload.
 */
export type RoleToolInput = {
    inputSchema: FlexibleSchema<unknown>;
    toPayload(input: unknown): unknown;
};
