/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import { SandboxError, systemClock } from '@chamvi/core';
import { DEFAULT_DEPLOYMENT } from '../../provider/constants.ts';
import type { ISandboxProvider, WorkspaceFindOptions } from '../../provider/types.ts';
import type { IWorkspace } from '../../workspace/types.ts';
import { GC_INTERVAL_MS, MAX_WORKSPACES_PER_RUN } from '../constants.ts';
import { createCredentialSupport } from '../credentials.ts';
import { authorEnv, credentialSources, isExpired } from '../helpers/index.ts';
import type { CredentialSupport, WorkspaceManagerOptions } from '../types.ts';
import type { WorkspaceEntry } from './types.ts';

/** The options and the state the parts of one workspace manager share; one per manager. */
export class WorkspaceManagerContext {
    readonly options: WorkspaceManagerOptions;

    readonly provider: ISandboxProvider;

    readonly clock: IClock;

    readonly maxPerRun: number;

    readonly gcIntervalMs: number;

    readonly deployment: string;

    readonly isSettled: WorkspaceManagerOptions['isSettled'];

    readonly isSuspendable: WorkspaceManagerOptions['isSuspendable'];

    readonly onError: (error: unknown) => void;

    readonly runs = new Map<string, Map<string, WorkspaceEntry>>();

    /** The lookup in flight per run; concurrent misses share it. */
    readonly lookups = new Map<string, Promise<void>>();

    /** Bumped by a release of a whole run while its lookup runs: that lookup disposes what it found. */
    readonly generations = new Map<string, number>();

    /**
     * Runs whose handles a suspendable answer forgot: the provider may have
     * suspended nothing (no persistence, local), so a settle still releases
     * them at once instead of waiting for the next collection.
     */
    readonly suspended = new Set<string>();

    closed = false;

    readonly credentials: CredentialSupport | undefined;

    /** Every disposal started and not settled yet, with its workspace id: close() waits for them. */
    readonly disposals = new Map<Promise<void>, string>();

    /**
     * Every create in flight a release aborted, with its label: close() waits
     * for them, since a run released by attach is no longer in `runs` while
     * the provider's abort cleanup, or the dispose of a workspace created
     * anyway, still runs.
     */
    readonly releasedCreates = new Map<Promise<unknown>, string>();

    /** The env and limits of every create, also what `find` gets to rebuild a workspace. */
    readonly rebuild: NonNullable<WorkspaceFindOptions['rebuild']> = {};

    constructor(options: WorkspaceManagerOptions) {
        this.options = options;
        this.provider = options.provider;
        this.clock = options.clock ?? systemClock;
        this.maxPerRun = options.maxWorkspacesPerRun ?? MAX_WORKSPACES_PER_RUN;
        this.gcIntervalMs = options.gcIntervalMs ?? GC_INTERVAL_MS;
        this.deployment = options.deployment ?? DEFAULT_DEPLOYMENT;
        this.isSettled = options.isSettled;
        this.isSuspendable = options.isSuspendable;
        // eslint-disable-next-line no-console
        this.onError = options.onError ?? ((error: unknown) => console.error('[chamvi]', error));

        const sources = credentialSources(options.credentials);

        this.credentials = sources.length === 0 ? undefined : createCredentialSupport({
            sources,
            clock: this.clock,
            onError: (error) => this.onError(error),
        });

        if (options.env !== undefined || options.author !== undefined) {
            this.rebuild.env = { ...options.env, ...authorEnv(options.author) };
        }

        if (options.limits !== undefined) {
            this.rebuild.limits = options.limits;
        }
    }

    disposeOrThrow(workspace: IWorkspace): Promise<void> {
        const disposal = (async () => {
            try {
                await workspace.dispose();
            } catch (error) {
                const message = Error.isError(error) ? error.message : String(error);
                throw new SandboxError(`workspace dispose failed: ${message}`, { cause: error });
            }
        })();

        this.disposals.set(disposal, workspace.id);

        const settled = () => {
            this.disposals.delete(disposal);
        };

        disposal.then(settled, settled);

        return disposal;
    }

    trackReleasedCreate(runId: string, pending: Promise<IWorkspace>): void {
        const tracked = pending.then(() => undefined, () => undefined);

        this.releasedCreates.set(tracked, `a workspace of run ${runId} still being created`);
        tracked.then(() => {
            this.releasedCreates.delete(tracked);
        });
    }

    disposeInBackground(workspace: IWorkspace): void {
        this.disposeOrThrow(workspace).catch(this.onError);
    }

    /** Removes `entry` from its run, dropping the run when it holds nothing more. */
    forget(runId: string, entry: WorkspaceEntry): void {
        const entries = this.runs.get(runId);

        if (!entries || entries.get(entry.key) !== entry) {
            return;
        }

        entries.delete(entry.key);

        if (entries.size === 0) {
            this.runs.delete(runId);
        }
    }

    /**
     * Forgets every expired or gone workspace of the run. The expired ones
     * are for disposal; the gone ones (not expired) are only forgotten, so
     * the next lookup finds them again when their container restarts.
     */
    sweep(runId: string): { expired: IWorkspace[]; gone: IWorkspace[] } {
        const now = new Date(this.clock.now());
        const expired: IWorkspace[] = [];
        const gone: IWorkspace[] = [];

        for (const entry of this.runs.get(runId)?.values() ?? []) {
            if (!entry.workspace) {
                continue;
            }

            if (isExpired(entry.workspace, now)) {
                this.forget(runId, entry);
                expired.push(entry.workspace);
            } else if (entry.workspace.disposed) {
                this.forget(runId, entry);
                gone.push(entry.workspace);
            }
        }

        return { expired, gone };
    }

    findOptions(): WorkspaceFindOptions {
        const { deployment, rebuild } = this;

        if (rebuild.env === undefined && rebuild.limits === undefined) {
            return { deployment };
        }

        return {
            deployment,
            rebuild: {
                ...(rebuild.env !== undefined && { env: { ...rebuild.env } }),
                ...(rebuild.limits !== undefined && { limits: rebuild.limits }),
            },
        };
    }

    heldEntries(runId: string): WorkspaceEntry[] {
        return [...this.runs.get(runId)?.values() ?? []]
            .filter((entry) => entry.workspace !== undefined);
    }

    generationOf(runId: string): number {
        return this.generations.get(runId) ?? 0;
    }

    /** Why `workspace` can no longer be used: gone (disposed outside the manager, container stopped) or expired. */
    deadError(workspace: IWorkspace): SandboxError {
        return new SandboxError(workspace.disposed ?
            `workspace ${workspace.id} is gone (disposed, or its container, pod or directory stopped or was removed); call create_workspace for a new one.` :
            `workspace ${workspace.id} expired at ${workspace.info.expiresAt.toISOString()} and was disposed; call create_workspace for a new one.`);
    }
}
