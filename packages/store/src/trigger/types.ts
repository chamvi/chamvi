/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { PermissionAuthorization, PermissionBinding, PermissionIdentity } from '@chamvi/access';
import type { Artifact } from '../artifact/types.ts';

/**
 * Who started a run (or answered an approval), as an authenticator resolved
 * it: a snapshot of identity and grants taken at dispatch, never a token.
 * Revoking a grant later does not reach a run that already holds it.
 */
export type Invoker = {
    id: string;
    /**
     * The authenticator's label: `@chamvi/http`'s staticTokens() sets
     * 'token' and authup() sets 'authup'; oidc() keeps the kind its
     * `principal` mapper returns (the docs use 'oidc'); a custom authenticator
     * or a direct dispatch may use its own (e.g. 'user').
     */
    kind: string;
    name?: string;
    /**
     * The grants, as authup permission bindings with resolved policies;
     * checked with `can()` of `@chamvi/access`. An entry that is not a
     * binding (a run stored with the older string grants) grants nothing.
     */
    bindings: readonly PermissionBinding[];
    /** authup's snapshot of the grants (plain JSON), checked together with `identity`; set for authup logins. */
    authorization?: PermissionAuthorization;
    /** What an `identity` policy evaluates; set for authup logins. */
    identity?: PermissionIdentity;
};

/**
 * The run that dispatched this one. Only the engine-internal host sets it;
 * a dispatch() envelope never carries one, so no caller forges lineage.
 */
export type TriggerParent = {
    kind: 'dispatch';
    runId: string;
    /** The parent run's agent. */
    agent: string;
    /** The dispatch role of the child agent this run was started through. */
    role: string;
    depth: number;
    /**
     * The one channel and address the dispatching code named for this run
     * (`dispatch(ctx, { source })`): its outbound gate exempts that
     * destination like a run's own source. Never from a generated dispatch tool.
     */
    source?: TriggerSource;
};

/** A channel and an address on it, as `dispatch()`'s `source` names it. */
export type TriggerSource = {
    channel: string;
    address: string;
};

export type TriggerEnvelope<P = unknown> = {
    id: string;
    agent: string;
    /** The id of the agent's subscription that started the run. */
    trigger: string;
    /** The name of the channel the run came from. */
    channel: string;
    payload: P;
    idempotencyKey?: string;
    concurrencyKey?: string;
    /** Where the run came from on that channel (an issue, a thread, a caller); the channel defines it. */
    address?: string;
    /** Files the run was started with, stored as artifacts of the run; the model gets them as file parts. */
    attachments?: Artifact[];
    /**
     * Who started the run; only ever set from an authenticator (never from a
     * payload). Absent for runs a channel started without one (cron, webhooks). With an invoker the
     * idempotency key is scoped to it, so only the same invoker's dispatch
     * is deduplicated (and gets its own first run).
     */
    invoker?: Invoker;
    /** The run that dispatched this one; set only by dispatch(), never from engine.dispatch(). */
    parent?: TriggerParent;
    receivedAt: Date;
};
