/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock, SandboxError } from '@chamvi/core';
import type { ExecOptions, SandboxLimits, WorkspaceInfo } from '@chamvi/sandbox';

export type LocalSandboxOptions = {
    /** Directory holding one folder per workspace. Default `join(os.tmpdir(), 'chamvi-workspaces')`. */
    root?: string;
    /** Added to every workspace's environment (after the defaults, so it wins). */
    env?: Record<string, string>;
    /** The only limit local enforces: the workspace lifetime (expiry, `maxLifetimeMs`). */
    limits?: Pick<SandboxLimits, 'maxLifetimeMs'>;
    /**
     * Point the package caches (`CACHE_ENV`'s variables) into `<root>/.cache`,
     * shared by every workspace of the root. Default true.
     */
    cache?: boolean;
    clock?: IClock;
};

/** What `LocalWorkspace` is built from (internal). */
export type LocalWorkspaceInput = {
    id: string;
    /** The workspace folder `<root>/<id>`. */
    dir: string;
    info: WorkspaceInfo;
    env: Record<string, string>;
    clock: IClock;
    /** Called once when the workspace starts disposing. */
    onDispose: () => void;
};

/**
 * `workspace.json` of a workspace folder (internal): what `find` rebuilds
 * the workspace from and the garbage collection reads. Times are ISO strings.
 */
export type WorkspaceRecord = {
    runId: string;
    deployment: string;
    repo?: string;
    ref?: string;
    /** The create's `env` (the provider's own is added again on every exec). */
    env?: Record<string, string>;
    createdAt: string;
    expiresAt: string;
};

/** A readable workspace record (internal). */
export type ParsedRecord = {
    runId: string;
    deployment: string;
    env?: Record<string, string>;
    info: WorkspaceInfo;
};

/** An exec in flight of a `LocalWorkspace` (internal): the dispose fails it. */
export type LiveExec = { fail(error: SandboxError): void };

/** What `spawnLocalExec` runs (internal): the command and the workspace state it reports to. */
export type LocalExecInput = {
    argv: readonly string[];
    /** The real directory the command starts in. */
    cwd: string;
    timeoutMs: number;
    options: ExecOptions;
    env: Record<string, string>;
    clock: IClock;
    /** The workspace's execs in flight: the exec is in it until it settles. */
    live: Set<LiveExec>;
    /** Remembers the group of a command that exited while a job of it runs on. */
    linger: (pid: number) => void;
};
