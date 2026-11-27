/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    AgentIssue,
    AgentSummary,
    KvWriteBody,
    ScheduleSummary,
} from '@chamvi/core-kit';
import type { HttpContext } from '../app/types.ts';
import type { Principal } from '../auth/types.ts';





// #region services
/** `GET /agents`: the agents, and their load issues, whose runs the caller may read. */
export type AgentListView = {
    data: AgentSummary[];
    issues: AgentIssue[];
};

/** A key and its value. */
export type KvEntry = {
    key: string;
    value: unknown;
};

/** `GET/PATCH /agents/{name}/state/kv/{key}`: the key and its value (`null` when unset). */
export type KvView = {
    key: string;
    value: unknown;
};

/** A stored document on the wire: its fields plus the store `id`. */
export type StateDocumentView = Record<string, unknown>;

/** What `AgentService` needs of the http context. */
export type AgentServiceContext = Pick<HttpContext, 'agents' | 'agentIssues' | 'channels' | 'basePath' | 'clock'>;

export interface IAgentService {
    /** `chamvi_run_read` for some agent, then the agents and issues it reads (per agent). */
    list(principal: Principal): Promise<AgentListView>;
    /** `chamvi_run_read` for some agent, then the cron subscriptions of the agents it reads. */
    schedules(principal: Principal): Promise<{ data: ScheduleSummary[] }>;
}

/** What `AgentStateService` needs of the http context. */
export type AgentStateServiceContext = Pick<HttpContext, 'agents' | 'stateService' | 'clock'>;

/**
 * Agent state. Each method checks the permission for `{ name }`, then the
 * agent (404), then `chamvi_agent_read` for a private agent, then its input.
 */
export interface IAgentStateService {
    list(name: string, query: URLSearchParams, principal: Principal): Promise<{ data: KvEntry[] }>;
    get(name: string, key: string, principal: Principal): Promise<KvView>;
    /** `data` is untrusted, validated here. */
    set(name: string, key: string, data: KvWriteBody, principal: Principal): Promise<KvView>;
    documents(name: string, collection: string, query: URLSearchParams, principal: Principal): Promise<{ data: StateDocumentView[] }>;
}

export type AgentControllerContext = {
    service: IAgentService;
    state: IAgentStateService;
};

export type ScheduleControllerContext = {
    service: IAgentService;
};

// #endregion services
