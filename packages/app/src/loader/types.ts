/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import type { Agent } from '@chamvi/core';

/** A folder agent: the agent built from its folder and the folder's content hash. */
export type LoadedAgent = {
    agent: Agent;
    /** `hashAgentFolder(dir)`. */
    hash: string;
    dir: string;
};

/** A folder that did not load; `message` names files relative to the agents dir, never an absolute path. */
export type AgentLoadIssue = {
    agent: string;
    message: string;
};

export type LoadAgentOptions = {
    /**
     * Reads `agent.ts` by absolute path and returns its module namespace. Default: a jiti reader without module
     * cache, so a re-read sees edits (imported files included), while
     * packages from `node_modules` load natively (one instance).
     */
    load?: (path: string) => Promise<unknown>;
};

export type LoadAgentsResult = {
    agents: LoadedAgent[];
    issues: AgentLoadIssue[];
};

/** An agent as a default export declares it, checked structurally (another `@chamvi/core` copy's agent passes). */
export type DeclaredAgent = {
    name: string;
    definition: Record<string, unknown>;
};
