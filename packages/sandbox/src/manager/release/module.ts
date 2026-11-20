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
import type { WorkspaceEntry } from '../context/types.ts';
import { toSandboxError } from '../helpers/index.ts';

/** The manager's removals: one workspace of a run (`dispose`), or all of it (`release`). */
export class WorkspaceRelease {
    protected readonly ctx: WorkspaceManagerContext;

    constructor(ctx: WorkspaceManagerContext) {
        this.ctx = ctx;
    }

    /**
     * The run's workspaces as the provider has them, only to remove one:
     * `restore: false`, so a suspended workspace is never rebuilt first, and
     * nothing adopted (outside the restoring `lookups`).
     */
    async findToRemove(runId: string): Promise<IWorkspace[]> {
        let found: IWorkspace[];

        try {
            found = await this.ctx.provider.find(runId, { deployment: this.ctx.deployment, restore: false });
        } catch (error) {
            throw toSandboxError(error, 'workspace lookup failed');
        }

        return found.filter((workspace) => workspace.info.runId === runId && !workspace.disposed);
    }

    /** Disposes one workspace of the run: by id, or its only one; never restores. */
    async disposeOne(runId: string, workspaceId?: string): Promise<string> {
        const { ctx } = this;
        const { expired, gone } = ctx.sweep(runId);

        for (const workspace of expired.filter((item) => item.id !== workspaceId)) {
            ctx.disposeInBackground(workspace);
        }

        const held = ctx.heldEntries(runId);
        let entry: WorkspaceEntry | undefined;
        let target: IWorkspace | undefined;

        if (workspaceId !== undefined) {
            entry = held.find((e) => e.workspace!.id === workspaceId);
            target = entry?.workspace ?? expired.find((workspace) => workspace.id === workspaceId) ??
                ctx.failedDisposals.get(runId)?.get(workspaceId);

            // a gone one may be back (its container restarted): the provider's handle first
            target ??= (await this.findToRemove(runId)).find((workspace) => workspace.id === workspaceId) ??
                gone.find((workspace) => workspace.id === workspaceId);

            if (!target) {
                throw new SandboxError(WORKSPACE_NOT_FOUND_MESSAGE);
            }
        } else {
            let candidates: IWorkspace[] = held.map((e) => e.workspace!);

            // a gone workspace may be back (its container restarted): ask before picking;
            // with nothing held, a target whose disposal failed is one too
            if (candidates.length === 0 || gone.length > 0) {
                const failed = candidates.length === 0 ? ctx.failedDisposals.get(runId)?.values().toArray() ?? [] : [];
                const ids = new Set([...candidates, ...failed].map((workspace) => workspace.id));

                candidates = [
                    ...candidates,
                    ...failed,
                    ...(await this.findToRemove(runId)).filter((workspace) => !ids.has(workspace.id)),
                ];
            }

            if (candidates.length === 0) {
                throw new SandboxError('This run has no workspace; call create_workspace first.');
            }

            if (candidates.length > 1) {
                const ids = candidates.map((workspace) => workspace.id).join(', ');
                throw new ValidationError(`This run has ${candidates.length} workspaces (${ids}); pass workspace to pick one.`);
            }

            [target] = candidates;
            entry = held.find((e) => e.workspace === target);
        }

        if (entry) {
            ctx.forget(runId, entry);
        }

        await ctx.disposeTarget(runId, target!);

        return target!.id;
    }

    async release(runId: string, workspaceId?: string): Promise<void> {
        const { ctx } = this;

        if (workspaceId !== undefined) {
            await this.disposeOne(runId, workspaceId);

            return;
        }

        // a lookup in flight disposes what it finds instead of adopting it
        if (ctx.lookups.has(runId)) {
            ctx.generations.set(runId, ctx.generationOf(runId) + 1);
        }

        const entries = ctx.runs.get(runId) ?? new Map<string, WorkspaceEntry>();

        ctx.runs.delete(runId);
        ctx.suspended.delete(runId);
        ctx.activity.delete(runId);

        // the targets whose disposal failed before go with the run (kept again while it fails)
        const retries = ctx.failedDisposals.get(runId)?.values().toArray() ?? [];

        // pending creates are aborted, see their run gone and dispose what they
        // get; waiting for them keeps a container from outliving the release
        const pending = entries.values().toArray().flatMap((entry) => {
            if (!entry.pending) {
                return [];
            }

            entry.abort?.abort();
            ctx.trackReleasedCreate(runId, entry.pending);

            return [entry.pending];
        });
        const owned = entries.values().toArray().flatMap((entry) => (entry.workspace ? [entry.workspace] : []));
        const held = [...owned, ...retries.filter((workspace) => owned.every((item) => item.id !== workspace.id))];
        const results = await Promise.allSettled(held.map((workspace) => ctx.disposeTarget(runId, workspace)));

        // their rejections belong to their acquire callers
        await Promise.allSettled(pending);

        // what other processes created for the run (or this one before a restart);
        // only to remove it, so a suspended workspace is never rebuilt first
        const ids = new Set(held.map((workspace) => workspace.id));
        const rest = await ctx.provider.find(runId, { deployment: ctx.deployment, restore: false }).then(
            (found) => Promise.allSettled(found
                .filter((workspace) => !ids.has(workspace.id) && workspace.info.runId === runId)
                .map((workspace) => ctx.disposeTarget(runId, workspace))),
            (error: unknown) => [{ status: 'rejected', reason: toSandboxError(error, 'workspace lookup failed') } as PromiseRejectedResult],
        );
        const failed = [...results, ...rest].find((result) => result.status === 'rejected');

        // every target was tried: the provider's collection owns what a settled run left
        ctx.failedDisposals.delete(runId);

        if (failed) {
            throw failed.reason;
        }
    }
}
