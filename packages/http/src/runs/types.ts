/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ArtifactInput,
    Invoker,
    Run,
    RunStatusLiteral,
    TriggerEnvelope,
    WaitPoint,
} from '@chamvi/core';

/** An invoker or approver as it leaves the package: identity only, never the grants. */
export type InvokerView = Omit<Invoker, 'bindings' | 'authorization'>;

/**
 * A run as it leaves the package (REST, SSE, MCP): without the internal
 * claim and conversation binding, and the invoker without its bindings.
 */
export type RunView = Omit<Run, 'claim' | 'trigger' | 'conversation'> & {
    trigger: Omit<TriggerEnvelope, 'invoker'> & { invoker?: InvokerView };
    /**
     * The run's agent is private (or not held by the app), as the server
     * checks it: `{ name: agent, private: agentPrivate }` are the attributes
     * of the agent permissions (`chamvi_agent_approve`, ...). Read when the
     * run is serialized.
     */
    agentPrivate: boolean;
};

/** `GET /runs` query after decoding. */
export type RunListQuery = {
    agent?: string;
    /** `filter[parent]`: only the runs this run dispatched. */
    parent?: string;
    status?: RunStatusLiteral[];
    /** `filter[waiting]`: only the runs whose wait point is of this kind. */
    waiting?: WaitPoint['kind'];
    limit: number;
    offset: number;
    /** `sort=createdAt` (default) or `sort=-createdAt`. */
    order: 'asc' | 'desc';
};

/** Body of `POST /agents/:name/runs`; internal. */
export type StartRunBody = {
    payload?: unknown;
    idempotencyKey?: string;
    /** Where the run came from on the http channel (a caller-defined thread or conversation). */
    address?: string;
    /** Decoded from base64 by the validator; unknown item keys are dropped by the route. */
    attachments?: ArtifactInput[];
};

/** Body of `POST /runs/:id/approve`. */
export type ApproveBody = {
    /** The wait point being answered; another one than the run's current is 409. */
    approvalId: string;
    approved: boolean;
    reason?: string;
    /** The chosen option ids of a wait point with options (one, or one or more with `multiple`); none on a denial. */
    selected?: string[];
};

