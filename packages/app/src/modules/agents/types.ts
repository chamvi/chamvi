/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent, IClock, IEngine } from '@chamvi/core';
import type { AgentIssue } from '@chamvi/http';
import type { IScheduledComponent } from 'hubwire';
import type { ILogger } from '../../logger/types.ts';
import type { AgentCheck } from '../../module/types.ts';

export type AgentsModuleOptions = {
    /**
     * The folder the agents dir and the agent packages resolve from. Default
     * `process.cwd()`. The config file's `agents` are always read from the
     * process cwd, the file the engine module reads the model settings from.
     */
    cwd?: string;
    /** Imports an agent package's entry by file URL. Default: a native `import()` with the app's packages pinned. */
    importer?: (url: string) => Promise<unknown>;
};

export type AgentsWatcherOptions = {
    /** The agents dir, absolute. */
    root: string;
    engine: IEngine;
    /**
     * Names the folders may not take, each with its issue message (the code
     * agents', then the package agents'): a folder of such a name is an
     * issue, never loaded or removed, and its marker is never an orphan.
     */
    reserved: ReadonlyMap<string, string>;
    /**
     * Role `start`: whether the boot removes the markers with neither a
     * folder nor a reserved name. False while a package failed before its
     * agents were known (any marker may be one of them). Default true.
     */
    removeOrphans?: boolean;
    /**
     * The checks a folder agent passes before it is registered (`AGENT_CHECKS`;
     * `putAgent` then refuses a model that cannot resolve): a throw is a load issue.
     */
    check: AgentCheck;
    clock: IClock;
    logger: ILogger;
    pollMs: number;
    /** Aborts preparation and prevents publication before a registry operation starts. */
    signal?: AbortSignal;
    /**
     * What the watcher may do to the store. `start`: register each folder
     * agent at its revision (a changed one cancels its old runs) and remove
     * the agents with a marker but neither a folder nor an agent passed in code. `job`:
     * register without ever cancelling (`putAgent(..., { reload: false })`):
     * a missing marker is written, a different one moved only while the agent
     * has no unsettled run, else the agent is a conflict (an issue, not
     * registered); no orphan is removed. `check`: only `engine.checkAgent()`,
     * no store read or write, nothing registered.
     */
    role: AgentsWatcherRole;
};

export type AgentsWatcherRole = 'start' | 'job' | 'check';

export interface IAgentsWatcher {
    /**
     * Loads every folder and registers its agent (agents passed in code win a name
     * clash), then (role `start`) removes every agent with a revision
     * marker but neither a folder nor an agent passed in code. Load failures, refused
     * checks and failed skill preparations are issues; store failures throw.
     */
    boot(): Promise<void>;
    /**
     * The polls (`agents-watcher`): every `pollMs` from `start()` on, the
     * first one interval after it; `stop()` ends them, `settled()` resolves
     * once the poll in flight (a reload included) settled. Started by the
     * components module (start mode outside a check), never after a role
     * other than `start`.
     */
    readonly component: IScheduledComponent;
    /**
     * The issue message of a job-role revision conflict of `name` (its stored
     * marker differs while it has unsettled runs), else undefined.
     */
    conflict(name: string): string | undefined;
    /**
     * The last failed skill preparation of `name` (an issue until a later
     * attempt succeeds or the folder changes) as `{ error }`, so a rejection
     * with `undefined` still counts, else undefined.
     */
    preparationFailure(name: string): { error: unknown } | undefined;
    /** The current load issues, as a fresh array. */
    issues(): AgentIssue[];
}

export type RegisterAgentInput = {
    engine: IEngine;
    agent: Agent;
    check: AgentCheck;
    role: AgentsWatcherRole;
    revision: string;
    /** Read after a successful preparation (never in role `check`): a marker at it is moved to `revision` without a cancel. */
    formerRevision?: () => Promise<string | undefined>;
    signal?: AbortSignal;
};

export type RegisterOutcome = { kind: 'registered' } |
    { kind: 'checked' } |
    { kind: 'issue'; message: string } |
    { kind: 'conflict'; message: string } |
    { kind: 'preparation'; error: unknown };

export type PackageAgentsOptions = {
    /** The merged package specifiers, in order (code, chamvi.json, CHAMVI_AGENTS). */
    specs: readonly string[];
    /** The folder the specifiers resolve from. */
    cwd: string;
    /** Dev markers (`<name>@<version>+<hash>`). */
    dev: boolean;
    engine: IEngine;
    /** The names of the agents passed in code: a package agent of such a name is an issue. */
    codeNames: ReadonlySet<string>;
    check: AgentCheck;
    clock: IClock;
    logger: ILogger;
    pollMs: number;
    signal?: AbortSignal;
    role: AgentsWatcherRole;
    /** Imports a package entry by file URL (tests). */
    importer?: (url: string) => Promise<unknown>;
};

export interface IPackageAgents {
    /**
     * Loads every package in order and registers its agents (agents passed in code
     * win, an earlier package wins); every failure is an issue, store
     * failures throw. A package agent's name stays reserved against folders
     * even when it failed.
     */
    boot(): Promise<void>;
    /**
     * The retries of failed skill preparations (`agents-packages`, capped
     * backoff on poll ticks): from `start()` on while a retry is pending, no
     * timer armed while none is; `stop()` ends them, `settled()` resolves once
     * the retry in flight settled. Started by the components module (start
     * mode outside a check).
     */
    readonly component: IScheduledComponent;
    /** The names the package agents claimed, each with the issue message of a folder of that name. */
    reserved(): ReadonlyMap<string, string>;
    /** The specifiers that failed before their agents were known (resolve, import, export shape). */
    unresolved(): string[];
    /** The job-role conflict message of `name`, else undefined. */
    conflict(name: string): string | undefined;
    /** The issue of a package agent `name` that is not registered, with the error behind it, else undefined. */
    failure(name: string): { message: string; error?: unknown } | undefined;
    issues(): AgentIssue[];
}

/** A pending retry: due at `at` (epoch ms), after a wait of `delay` (the next wait doubles it). */
export type RetryEntry = {
    delay: number;
    at: number;
};

export type RetryLoopOptions = {
    /** The component's name. */
    name: string;
    clock: IClock;
    pollMs: number;
    logger: ILogger;
    /** Retries the entry `name`; it deletes or re-sets the entry itself. A rejection is logged and fails the pass. */
    retry(name: string): Promise<void>;
};

export interface IRetryLoop {
    /** Runs the due retries on poll ticks while any is pending (see `createRetryLoop`). */
    readonly component: IScheduledComponent;
    get(name: string): RetryEntry | undefined;
    /** Adds or replaces a retry; starts the loop again when the component is started. */
    set(name: string, entry: RetryEntry): void;
    delete(name: string): boolean;
    /** Whether the component was stopped (and not started again since). */
    stopped(): boolean;
}
