/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Artifact,
    ArtifactInput,
    Invoker,
    Run,
    RunStatusLiteral,
    Step,
    TriggerEnvelope,
    WaitPoint,
} from '@chamvi/core';
import type { HttpContext } from '../app/types.ts';
import type { Principal } from '../auth/types.ts';

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


// #region services
/** What `RunService` needs of the http context. */
export type RunServiceContext = Pick<HttpContext, 'engine' | 'store' | 'agents' | 'clock'>;

/** `POST /agents/:name/runs`: the agent name, the untrusted body and the `Idempotency-Key` header. */
export type StartRunInput = {
    agent: string;
    data: StartRunBody;
    idempotencyHeader?: string | null;
};

/** The started (or deduplicated) run. */
export type StartRunView = {
    runId: string;
    deduplicated: boolean;
};

/** `GET /runs`: a page of runs. */
export type RunListView = {
    data: RunView[];
    meta: {
        total: number;
        limit: number;
        offset: number;
    };
};

/** `GET /runs/:id`: the run with its steps. */
export type RunDetailView = RunView & { steps: Step[] };

/** One artifact of a run with its bytes. */
export type RunArtifactView = {
    artifact: Artifact;
    data: Uint8Array;
};

/** `POST /runs/:id/cancel`: the run's status after the cancel. */
export type CancelRunView = {
    runId: string;
    status?: RunStatusLiteral;
};

/** `POST /runs/:id/approve`: the answered run, queued again. */
export type ApproveRunView = {
    runId: string;
    status: 'queued';
};

/**
 * Runs: start, read, cancel, approve. Each method keeps the check order of
 * the route it serves; `data` arguments are untrusted and validated here.
 */
export interface IRunService {
    /** `chamvi_agent_run` (403), the agent (404), its http subscription (404), the body, then the dispatch. */
    start(input: StartRunInput, principal: Principal): Promise<StartRunView>;
    list(query: URLSearchParams, principal: Principal): Promise<RunListView>;
    /** The run once the principal may read it: 404 for a missing or protected agent's run, else 403. */
    getReadable(id: string, principal: Principal): Promise<Run>;
    get(id: string, principal: Principal): Promise<RunDetailView>;
    artifacts(id: string, principal: Principal): Promise<{ data: Artifact[] }>;
    artifact(id: string, artifactId: string, principal: Principal): Promise<RunArtifactView>;
    /** `chamvi_run_cancel` (403), for the run's agent when it exists (403), then the engine (404, 409). */
    cancel(id: string, principal: Principal): Promise<CancelRunView>;
    /** The run (404), `chamvi_agent_approve` for its agent (403), then the body. */
    approve(id: string, data: ApproveBody, principal: Principal): Promise<ApproveRunView>;
}

export type RunControllerContext = {
    service: IRunService;
};

// #endregion services
