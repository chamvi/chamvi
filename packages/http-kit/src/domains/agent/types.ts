/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { PeerStartInput } from '@chamvi/core';
import type { AgentIssue, AgentSummary } from '@chamvi/http';
import type { APIRequestOptions, Wire } from '../types.ts';

export type AgentWire = AgentSummary;

export type AgentIssueWire = Wire<AgentIssue>;

/** `GET /agents`: the loaded agents and the ones that failed to load. */
export type AgentList = {
    data: AgentWire[];
    issues: AgentIssueWire[];
};

/** The caller's lineage on a peer start: the stand-in run, the calling run, its taint and the origin name. */
export type PeerStartWire = Wire<PeerStartInput['peer']>;

/** One attachment of a start as sent: the bytes in base64. */
export type AttachmentWire = {
    /** `type/subtype`, e.g. `image/png`. */
    mediaType: string;
    filename?: string;
    data: string;
};

export type StartRunBody = {
    payload: unknown;
    /** Dedupes a retried start (scoped to the agent, the source and the principal). */
    idempotencyKey?: string;
    /** Stored as artifacts of the run (at most `MAX_ATTACHMENTS` of `@chamvi/http`, bounded by its body limit). */
    attachments?: AttachmentWire[];
    /** The `agent.on()` role a peer start targets. */
    role?: string;
    /** Sent only by a peer app: the server refuses it from any other principal. */
    peer?: PeerStartWire;
};

export type StartRunResult = { runId: string; deduplicated: boolean };

export interface IAgentAPI {
    getMany(options?: APIRequestOptions): Promise<AgentList>;
    /** `POST /agents/:name/runs`: a run through the agent's `http.on()` subscription. */
    startRun(name: string, body: StartRunBody, options?: APIRequestOptions): Promise<StartRunResult>;
}
