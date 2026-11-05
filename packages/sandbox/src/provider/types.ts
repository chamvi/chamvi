/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { CheckoutOptions } from '../repo/types.ts';
import type { IWorkspace } from '../workspace/types.ts';

export type SandboxLimits = {
    /** Kubernetes quantity, e.g. `'1'`, `'500m'`. */
    cpu?: string;
    /** Bytes as a Kubernetes quantity, e.g. `'2Gi'`. */
    memory?: string;
    /** Disk of `/workspace`, e.g. `'4Gi'`. */
    storage?: string;
    pids?: number;
    /**
     * Hard cap of a workspace's lifetime (its `expiresAt`), from its creation,
     * never renewed. Nothing kills a workspace earlier while its run lives;
     * garbage collection removes it once expired or its run settled.
     */
    maxLifetimeMs?: number;
};

export type WorkspaceCreateOptions = {
    runId: string;
    /** A normalized repository URL (`normalizeRepo`); without it the workspace is only `git init`-ed. */
    repo?: string;
    ref?: string;
    /** Passed to `prepareWorkspace`: a shallow `depth`, the read `credential` of a private repository. */
    checkout?: CheckoutOptions;
    /** The image of a container or pod workspace; default the provider's. */
    image?: string;
    env?: Record<string, string>;
    limits?: SandboxLimits;
    /** The deployment the workspace belongs to; default `DEFAULT_DEPLOYMENT`. */
    deployment?: string;
    signal?: AbortSignal;
};

export type WorkspaceFindOptions = {
    /** Only workspaces of this deployment; default `DEFAULT_DEPLOYMENT`. */
    deployment?: string;
    signal?: AbortSignal;
    /**
     * What a provider that rebuilds a suspended workspace (Kubernetes with
     * persistence) needs of the create's configuration: the `env` and
     * `limits` the manager passes to every `create`. Never stored with the
     * workspace (the env may hold secrets), so a rebuild after a redeploy
     * gets the current configuration.
     */
    rebuild?: {
        env?: Record<string, string>;
        limits?: SandboxLimits;
    };
    /**
     * False for a lookup that only removes what it finds (the manager's
     * `release`): a provider that rebuilds a suspended workspace answers it
     * as it is, a handle whose `dispose` removes it and whose commands fail.
     * Default true.
     */
    restore?: boolean;
};

export type GarbageCollectOptions = {
    /** Only workspaces of this deployment; default `DEFAULT_DEPLOYMENT`. */
    deployment?: string;
    /**
     * True when the run settled or no longer exists: its workspaces go too,
     * expired or not. A rejection keeps them and counts as a failure.
     */
    isSettled?(runId: string): Promise<boolean>;
    /**
     * True when the run has waited long enough: a provider that can suspend
     * stops that run's running workspaces without removing them (their files
     * stay, `find` brings them back), one that cannot ignores it. Removal
     * (expiry, `isSettled`) wins over suspension. A rejection keeps them
     * running and counts as a failure.
     */
    isSuspendable?(runId: string): Promise<boolean>;
};

export interface ISandboxProvider {
    readonly name: string;
    /**
     * A ready workspace (id `randomUUID()`), checked out when `repo` is given
     * (via `prepareWorkspace` with `checkout`, then `info.commit` and
     * `info.defaultBranch` from its result).
     */
    create(options: WorkspaceCreateOptions): Promise<IWorkspace>;
    /**
     * Every live, unexpired workspace of the run in the deployment this
     * provider can reach (labels, folders), reconnected: the instance this
     * process holds, else a new one rebuilt from what lives with the
     * workspace. Never creates a workspace; may restart one (a stopped
     * Docker container) or rebuild its pod (Kubernetes persistence, with
     * `rebuild`).
     */
    find(runId: string, options?: WorkspaceFindOptions): Promise<IWorkspace[]>;
    /**
     * Deletes this provider's workspaces of the deployment past their expiry
     * and, with `isSettled`, those whose run settled; returns how many. With
     * `isSuspendable` it may suspend the running workspaces of long-waiting
     * runs (not counted, never removed). One
     * that cannot be removed never keeps the others: the pass goes on and
     * rejects with one SandboxError at the end.
     */
    collectGarbage(options?: GarbageCollectOptions): Promise<number>;
}
