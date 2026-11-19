/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    ArtifactInput,
    ChannelSubscription,
    PeerRunView,
} from '@chamvi/core';
import type {
    Artifact,
    Invoker,
    Run,
    RunStatusLiteral,
    Step,
    TriggerEnvelope,
    WaitPoint,
} from '@chamvi/store';
import type { IFilter } from '@rapiq/core';
import type { HttpContext } from '../app/types.ts';
import type { Principal } from '../auth/types.ts';
import type { HTTP_CHANNEL_NAME, MCP_CHANNEL_NAME } from '../channels/constants.ts';

/** An invoker or approver as the API serves it: its identity only, never its grants. */
export type InvokerView = Omit<Invoker, 'bindings' | 'authorization'>;

/**
 * A run as the API serves it (REST, SSE, MCP): its invoker carries the
 * identity only, never the grants.
 */
export type RunView = Omit<Run, 'claim' | 'trigger' | 'conversation'> & {
    /** What started the run; `payload` is absent when the run was started without one. */
    trigger: Omit<TriggerEnvelope, 'invoker' | 'payload'> & { payload?: unknown; invoker?: InvokerView };
    /**
     * The run's agent is private (or not held by the app), as the server
     * checks it: `{ name: agent, private: agentPrivate }` are the attributes
     * of the agent permissions (`chamvi_agent_approve`, ...). Read when the
     * run is serialized.
     */
    agentPrivate: boolean;
};

/** The filter, page and order a run listing takes (`GET /runs`, MCP `list_runs`). */
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

/** Body of `POST /agents/{name}/runs`; internal. */
export type StartRunBody = {
    payload?: unknown;
    idempotencyKey?: string;
    /** Where the run came from on the http channel (a caller-defined thread or conversation). */
    address?: string;
    /** Decoded from base64 by the validator; unknown item keys are dropped by the route. */
    attachments?: ArtifactInput[];
};

/** The caller's lineage on a peer start (`peer` of `POST /agents/{name}/runs`). */
export type PeerStartBody = {
    /** The caller's stand-in run, the target of this app's wake-up ping. */
    standIn: string;
    /** The calling run on the peer. */
    parent: {
        runId: string;
        agent: string;
        depth: number;
    };
    /** Whether the calling run is tainted: the started run is tainted from the start. */
    taint: boolean;
    /** The name of the person behind the call, for display only (never a grant). */
    origin?: string;
};

/** Body of a peer's `POST /agents/{name}/runs`; internal. */
export type PeerStartRunBody = Omit<StartRunBody, 'idempotencyKey'> & {
    idempotencyKey?: string;
    /** The receiving `agent.on()` role. */
    role: string;
    peer: PeerStartBody;
};

/** One attachment of `POST /agents/{name}/runs` as sent. */
export type AttachmentRequestBody = {
    /** `type/subtype`, e.g. `image/png`. */
    mediaType: string;
    filename?: string;
    /** The bytes in base64. */
    data: string;
};

/** The body of `POST /agents/{name}/runs`. */
export type StartRunRequestBody = {
    payload?: unknown;
    idempotencyKey?: string;
    /** Where the run came from on the http channel (a caller-defined thread or conversation). */
    address?: string;
    attachments?: AttachmentRequestBody[];
    /** Peer starts only: the receiving `agent.on()` role. Any other principal sending it gets 400. */
    role?: string;
    /** Peer starts only: the caller's lineage. Any other principal sending it gets 400. */
    peer?: PeerStartBody;
};

/** Body of `POST /runs/{id}/approve`. */
export type ApproveBody = {
    /** The wait point being answered; another one than the run's current is 409. */
    approvalId: string;
    approved: boolean;
    reason?: string;
    /** The chosen option ids of a wait point with options (one, or one or more with `multiple`); none on a denial. */
    selected?: string[];
};

/**
 * `GET /runs` after decoding and validation; internal: rapiq filters on the
 * run's fields (`agent`, `parentRunId`, `status`, `waiting`), the name
 * `filter[agent]` gave (the permission check reads it), the page and the
 * sorts (`createdAt` only).
 */
export type RunListRequest = {
    filters: IFilter[];
    agent?: string;
    limit: number;
    offset: number;
    sorts: Record<string, 'ASC' | 'DESC'>;
};

// #region services
/** What `RunHttpService` needs of the http context. */
export type RunHttpServiceContext = Pick<HttpContext, 'engine' | 'runService' | 'stepService' | 'artifactService' | 'agents' | 'clock' | 'onError'>;

/** `POST /agents/{name}/runs`: the agent name, the untrusted body and the `Idempotency-Key` header. */
export type StartRunInput = {
    agent: string;
    /** Unvalidated: a `StartRunRequestBody` on the wire. */
    data: unknown;
    idempotencyHeader?: string | null;
};

/**
 * A start of a checked agent through its http subscription, on REST
 * (`http`) or MCP (`mcp`); `payload` is untrusted and validated against
 * the subscription's schema.
 */
export type DispatchRunInput = {
    agent: Agent;
    subscription: ChannelSubscription;
    channel: typeof HTTP_CHANNEL_NAME | typeof MCP_CHANNEL_NAME;
    payload: unknown;
    idempotencyKey?: string;
    address?: string;
    attachments?: ArtifactInput[];
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

/** A run listing's filter and page: `GET /runs` (parsed) and MCP `list_runs`. */
export type RunFindFilter = Pick<RunListQuery, 'agent' | 'parent' | 'status' | 'waiting' | 'limit' | 'offset'> &
    Partial<Pick<RunListQuery, 'order'>>;

/** A page of runs as stored, with the total of the filter. */
export type RunFindView = {
    data: Run[];
    total: number;
};

/** `GET /runs/{id}`: the run with its steps. */
export type RunDetailView = RunView & { steps: Step[] };

/** `GET /runs/{id}`: the run with its steps, or for a peer the peer view of a run it started. */
export type RunReadView = RunDetailView | PeerRunView;

/** One artifact of a run with its bytes. */
export type RunArtifactView = {
    artifact: Artifact;
    data: Uint8Array;
};

/** `POST /runs/{id}/cancel`: the run's status after the cancel. */
export type CancelRunView = {
    runId: string;
    status?: RunStatusLiteral;
};

/** `POST /runs/{id}/approve`: the answered run, queued again. */
export type ApproveRunView = {
    runId: string;
    status: 'queued';
};

/**
 * Runs: start, read, cancel, approve. Each method keeps the check order of
 * the route it serves; `data` arguments are untrusted and validated here.
 */
export interface IRunHttpService {
    /**
     * `chamvi_agent_run` (403), the agent (404), its http subscription (404), the body, then the dispatch.
     * With `peer` or `role` in the body: a non-peer principal 400; a peer the agent (404, also
     * ungranted), the body (400), then `engine.dispatchPeer()` (400, 404, 503 while another replica counts the call).
     */
    start(input: StartRunInput, principal: Principal): Promise<StartRunView>;
    /**
     * Dispatches an `agent` the caller has already authorized and resolved:
     * validates the payload against the subscription's schema, then
     * dispatches with `checked: agent` (409 for a replaced agent).
     */
    dispatch(input: DispatchRunInput, principal: Principal): Promise<StartRunView>;
    list(query: URLSearchParams, principal: Principal): Promise<RunListView>;
    /** The runs the principal may list (403 otherwise, see `assertCanListRuns()`), as stored. */
    find(filter: RunFindFilter, principal: Principal): Promise<RunFindView>;
    /** The run once the principal may read it: 404 for a missing or protected agent's run, else 403. */
    getReadable(id: string, principal: Principal): Promise<Run>;
    /** The run with its steps; for a peer the peer view of a run it started, any other run 404. */
    get(id: string, principal: Principal): Promise<RunReadView>;
    artifacts(id: string, principal: Principal): Promise<{ data: Artifact[] }>;
    artifact(id: string, artifactId: string, principal: Principal): Promise<RunArtifactView>;
    /**
     * `chamvi_run_cancel` (403), for the run's agent when it exists (403), then the engine (404, 409).
     * A peer cancels the runs it started without that grant, any other run 404.
     */
    cancel(id: string, principal: Principal): Promise<CancelRunView>;
    /**
     * A peer's content-free wake of its stand-in run `id` (`engine.wake()`), then, for
     * a fresh mark, a detached `engine.tick()`. Every peer gets 202 whatever the run
     * (a stand-in settled meanwhile is routine); a non-peer gets the unknown-run 404.
     */
    wake(id: string, principal: Principal): Promise<void>;
    /** A peer: the unknown-run 404, whatever its grants; else the run (404), `chamvi_agent_approve` for its agent (403), then the body. */
    approve(id: string, data: ApproveBody, principal: Principal): Promise<ApproveRunView>;
    /**
     * Answers the run's approval with an answer the caller validated: the run
     * (404), `chamvi_agent_approve` for its agent (403), then the engine's 404, 409.
     */
    answer(id: string, answer: ApproveBody, principal: Principal): Promise<ApproveRunView>;
}

export type RunControllerContext = {
    service: IRunHttpService;
};

// #endregion services
