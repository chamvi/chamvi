/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    ApprovalOption,
    ChannelSubscription,
    Run,
    RunStatusLiteral,
} from '@chamvi/core';
import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Principal } from '../auth/types.ts';
import type { IRunService } from '../runs/types.ts';

/** A run as `list_runs` lists it. */
export type RunSummary = Pick<Run, 'id' | 'agent' | 'status' | 'createdAt' | 'finishedAt' | 'error'>;

/** The approval a `run_<agent>` result waits behind: the run's own, or a descendant's (`runId`, `agent` name it). */
export type RunToolApprovalWait = {
    kind: 'approval';
    /** The run waiting on the approval: answer it with `approve_run` on this run id. */
    runId: string;
    agent: string;
    toolName: string;
    /** What the tool asks the owner to approve. */
    title: string;
    body?: string;
    /** Run artifact ids shown with the request (`GET /runs/:id/artifacts/:artifactId`). */
    artifacts?: string[];
    /** The choices to answer with `approve_run`'s `selected`; absent for a plain yes or no. */
    options?: ApprovalOption[];
    /** Set (true) when several options may be selected. */
    multiple?: boolean;
    expiresAt: string;
};

/** The run waits on the runs it dispatched (no human answer). */
export type RunToolDispatchWait = {
    kind: 'dispatch';
    toolName: string;
    runIds: string[];
    expiresAt: string;
};

/** What `run_<agent>` answers. */
export type RunToolResult = {
    runId: string;
    status: RunStatusLiteral;
    deduplicated: boolean;
    output?: unknown;
    error?: { code: string; message: string };
    waiting?: RunToolApprovalWait | RunToolDispatchWait;
};

/** Resolved MCP options; internal. */
export type McpEndpointOptions = {
    name: string;
    version: string;
    maxWaitSeconds: number;
};

/** The services the MCP tools call (shared with the REST controllers); internal. */
export type McpServices = {
    runs: IRunService;
};

/** What the route hands each MCP request through `authInfo.extra`; internal. */
export type McpRequestExtra = {
    principal: Principal;
    /** Follows the HTTP request and the shutdown: aborts when the client goes away or the app closes. */
    signal: AbortSignal;
};

/** What `waitForRun` resolves with; internal. */
export type WaitForRunResult = {
    run: Run;
    /** A descendant waiting on an approval while `run` waits on a dispatch. */
    approval?: Run;
};

/** Options of `waitForRun`; internal. */
export type WaitForRunOptions = {
    timeoutMs: number;
    pollMs: number;
    /** Stops the wait early (the run as stored then is the answer). */
    signal?: AbortSignal;
};

/** The arguments of a `run_<agent>` call; internal. */
export type RunAgentArgs = {
    payload?: unknown;
    idempotencyKey?: string;
    address?: string;
    waitSeconds?: number;
};

/** A `run_<agent>` tool definition, built once per agent object; internal. */
export type McpRunTool = {
    agent: Agent;
    subscription: ChannelSubscription;
    schema?: StandardSchemaV1;
    description: string;
    inputSchema: StandardSchemaWithJSON<RunAgentArgs, RunAgentArgs>;
};
