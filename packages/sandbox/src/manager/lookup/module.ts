/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { SandboxError, ValidationError } from '@chamvi/core';
import type { IWorkspace } from '../../workspace/types.ts';
import { WORKSPACE_NOT_FOUND_MESSAGE } from '../context/constants.ts';
import type { WorkspaceManagerContext } from '../context/module.ts';
import type { WorkspaceEntry, WorkspaceMiss } from '../context/types.ts';
import { isExpired, toSandboxError } from '../helpers/index.ts';

/** The manager's lookups through `provider.find`: adopting what they find and picking a run's workspace. */
export class WorkspaceLookup {
    protected readonly ctx: WorkspaceManagerContext;

    constructor(ctx: WorkspaceManagerContext) {
        this.ctx = ctx;
    }

    /**
     * Holds what a lookup found: one workspace per repository key, never over
     * one held or being created, never a repository's without its commit.
     */
    adopt(runId: string, found: readonly IWorkspace[]): void {
        const { runs, suspended } = this.ctx;
        const now = new Date(this.ctx.clock.now());
        let entries = runs.get(runId);

        for (const workspace of found) {
            if (workspace.info.runId !== runId || workspace.disposed || isExpired(workspace, now)) {
                continue;
            }

            // a workspace of a repository without its commit is a create that died
            // during the checkout (or one still running elsewhere): a fresh create
            // checks out anew, the collection removes it
            if (workspace.info.repo !== undefined && workspace.info.commit === undefined) {
                continue;
            }

            const key = workspace.info.repo ?? '';

            // a second workspace of one key (a crash between two creates) stays
            // unused; the release of the settled run disposes it
            if (entries?.has(key)) {
                continue;
            }

            if (!entries) {
                entries = new Map();
                runs.set(runId, entries);
                suspended.delete(runId);
            }

            const entry: WorkspaceEntry = { key, workspace };

            if (workspace.info.ref !== undefined) {
                entry.ref = workspace.info.ref;
            }

            if (workspace.info.image !== undefined) {
                entry.image = workspace.info.image;
            }

            entries.set(key, entry);
        }
    }

    /** Asks the provider for the run's workspaces and adopts them; concurrent callers share one lookup. */
    lookup(runId: string): Promise<void> {
        const { ctx } = this;
        const { lookups, generations } = ctx;

        if (ctx.closed) {
            return Promise.reject(new SandboxError('the workspace manager is closed.'));
        }

        const inFlight = lookups.get(runId);

        if (inFlight) {
            return inFlight;
        }

        const generation = ctx.generationOf(runId);
        const pending = (async () => {
            let found: IWorkspace[];

            try {
                found = await ctx.provider.find(runId, ctx.findOptions());
            } catch (error) {
                throw toSandboxError(error, 'workspace lookup failed');
            }

            if (ctx.generationOf(runId) !== generation) {
                // the run was released (settled) meanwhile: what it still had goes
                for (const workspace of found) {
                    ctx.disposeInBackground(workspace);
                }

                throw new SandboxError('workspace released while it was looked up; call create_workspace again.');
            }

            // closed meanwhile: the workspaces stay for their runs
            if (ctx.closed) {
                throw new SandboxError('the workspace manager is closed.');
            }

            this.adopt(runId, found);
        })();

        lookups.set(runId, pending);

        const done = () => {
            if (lookups.get(runId) !== pending) {
                return;
            }

            lookups.delete(runId);
            // a release only bumps the generation while a lookup runs
            generations.delete(runId);
        };

        pending.then(done, done);

        return pending;
    }

    /**
     * The workspace `get` answers from what the run holds, or a Miss when
     * only a lookup can tell; `missed` is the Miss of the pass before the
     * lookup, so the second pass answers without asking again.
     */
    pick(runId: string, workspaceId: string | undefined, missed?: WorkspaceMiss): IWorkspace | WorkspaceMiss {
        const { ctx } = this;
        const { expired, gone } = ctx.sweep(runId);
        // the reasons before the disposal: a disposed workspace reads as gone
        const dead = expired.map((workspace) => ({ id: workspace.id, error: ctx.deadError(workspace) }));

        for (const workspace of expired) {
            ctx.disposeInBackground(workspace);
        }

        const lost = [...gone, ...missed?.gone ?? []];

        if (workspaceId === undefined) {
            // a gone workspace may be back (its container restarted): ask before picking
            if (!missed && gone.length > 0) {
                return { miss: true, gone };
            }

            const held = ctx.heldEntries(runId);

            if (held.length === 0) {
                if (dead.length > 0) {
                    throw dead[0]!.error;
                }

                if (!missed) {
                    return { miss: true, gone };
                }

                throw lost.length > 0 ?
                    ctx.deadError(lost[0]!) :
                    new SandboxError('This run has no workspace; call create_workspace first.');
            }

            if (held.length > 1) {
                const ids = held.map((e) => e.workspace!.id).join(', ');
                throw new ValidationError(`This run has ${held.length} workspaces (${ids}); pass workspace to pick one.`);
            }

            return held[0]!.workspace!;
        }

        const entry = ctx.heldEntries(runId).find((e) => e.workspace!.id === workspaceId);

        if (entry) {
            return entry.workspace!;
        }

        const expiredOne = dead.find((item) => item.id === workspaceId);

        if (expiredOne) {
            throw expiredOne.error;
        }

        if (!missed) {
            return { miss: true, gone };
        }

        const goneOne = lost.find((workspace) => workspace.id === workspaceId);
        throw goneOne ? ctx.deadError(goneOne) : new SandboxError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    async get(runId: string, workspaceId?: string): Promise<IWorkspace> {
        const picked = this.pick(runId, workspaceId);

        if (!('miss' in picked)) {
            return picked;
        }

        await this.lookup(runId);

        return this.pick(runId, workspaceId, picked) as IWorkspace;
    }
}
