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

    /**
     * Per run, the activity stamp of its last acquire, get or adoption: a
     * suspension decided across a change of it is stale (a handle went out).
     */
    readonly activity = new Map<string, number>();

    protected activityCount = 0;

    /**
     * Per run, the transitions of the collections whose provider is
     * suspending it: its lookups wait for all of them, so nothing adopts a
     * workspace being stopped. Overlapping passes each add their own.
     */
    readonly suspensions = new Map<string, Set<Promise<void>>>();

    /** Resolves on close(): no suspension holds a lookup beyond it. */
    protected readonly closing = Promise.withResolvers<void>();

    /** Per run and workspace id, a target whose disposal failed: only a removal retries it, never get or acquire. */
    readonly failedDisposals = new Map<string, Map<string, IWorkspace>>();

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

        const { onError } = this;
        const sources = credentialSources(options.credentials);

        this.credentials = sources.length === 0 ? undefined : createCredentialSupport({
            sources,
            clock: this.clock,
            onError: (error) => onError(error),
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
                throw new SandboxError(`workspace ${workspace.id} dispose failed: ${message}`, { cause: error });
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

    /** Disposes a workspace of the run, kept in `failedDisposals` for a retry while its disposal fails. */
    async disposeTarget(runId: string, workspace: IWorkspace): Promise<void> {
        let failed = this.failedDisposals.get(runId);

        try {
            await this.disposeOrThrow(workspace);
        } catch (error) {
            if (!failed) {
                failed = new Map();
                this.failedDisposals.set(runId, failed);
            }

            failed.set(workspace.id, workspace);

            throw error;
        }

        // disposed, also through another handle of the same workspace: nothing to retry
        failed = this.failedDisposals.get(runId);

        if (!failed?.delete(workspace.id)) {
            return;
        }

        if (failed.size === 0) {
            this.failedDisposals.delete(runId);
        }
    }

    /** Stamps the run's activity; only a collection with isSuspendable reads it. */
    touch(runId: string): void {
        if (!this.isSuspendable) {
            return;
        }

        this.activityCount++;
        this.activity.set(runId, this.activityCount);
    }

    /** Holds the run's lookups until `transition` settles (or the manager closes). */
    suspend(runId: string, transition: Promise<void>): void {
        let transitions = this.suspensions.get(runId);

        if (!transitions) {
            transitions = new Set();
            this.suspensions.set(runId, transitions);
        }

        transitions.add(transition);
    }

    /** Drops the hold of `transition`; the run's lookups proceed once no other pass holds them. */
    resume(runId: string, transition: Promise<void>): void {
        const transitions = this.suspensions.get(runId);

        if (transitions?.delete(transition) && transitions.size === 0) {
            this.suspensions.delete(runId);
        }
    }

    /** What a lookup of the run waits for: every suspension in flight, at most until close(). */
    async suspensionOf(runId: string): Promise<void> {
        const transitions = this.suspensions.get(runId);

        if (transitions) {
            await Promise.race([Promise.all(transitions), this.closing.promise]);
        }
    }

    /** Marks the manager closed and releases every lookup a suspension holds. */
    close(): void {
        this.closed = true;
        this.suspensions.clear();
        this.closing.resolve();
    }

    activityOf(runId: string): number {
        return this.activity.get(runId) ?? 0;
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
