/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AgentIssue, AgentSummary } from '@chamvi/http';
import type { APIRequestOptions, Wire } from '../types.ts';

export type AgentWire = AgentSummary;

export type AgentIssueWire = Wire<AgentIssue>;

/** `GET /agents`: the loaded agents and the ones that failed to load. */
export type AgentList = {
    data: AgentWire[];
    issues: AgentIssueWire[];
};

export type StartRunBody = {
    payload: unknown;
    /** Dedupes a retried start (scoped to the agent, the source and the principal). */
    idempotencyKey?: string;
};

export type StartRunResult = { runId: string; deduplicated: boolean };

export interface IAgentAPI {
    getMany(options?: APIRequestOptions): Promise<AgentList>;
    /** `POST /agents/:name/runs`: a run through the agent's `http.on()` subscription. */
    startRun(name: string, body: StartRunBody, options?: APIRequestOptions): Promise<StartRunResult>;
}
