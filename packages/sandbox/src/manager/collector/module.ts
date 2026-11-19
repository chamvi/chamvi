/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { GarbageCollectOptions } from '../../provider/types.ts';
import type { WorkspaceManagerContext } from '../context/module.ts';
import type { WorkspaceRelease } from '../release/module.ts';

/** The manager's garbage collection: expired, settled and suspendable runs, then the provider's. */
export class WorkspaceCollector {
    protected readonly ctx: WorkspaceManagerContext;

    protected readonly releaser: WorkspaceRelease;

    protected lastGcAt: number | undefined;

    constructor(ctx: WorkspaceManagerContext, releaser: WorkspaceRelease) {
        this.ctx = ctx;
        this.releaser = releaser;
    }

    async collectGarbage(): Promise<number> {
        const { ctx } = this;
        const {
            runs,
            suspended,
            isSettled,
            isSuspendable,
            onError,
        } = ctx;

        this.lastGcAt = ctx.clock.now();

        const expired = runs.keys().toArray().flatMap((runId) => ctx.sweep(runId).expired);
        // an expired workspace found gone may still leave a stopped container
        // behind, but only the expired live ones count as collected here
        const counted = expired.filter((workspace) => !workspace.disposed).length;
        // own disposals first: the provider's collection would find the same
        // expired workspaces, count them twice and dispose them concurrently
        const disposed = await Promise.allSettled(expired.map((workspace) => ctx.disposeOrThrow(workspace)));

        for (const result of disposed) {
            if (result.status === 'rejected') {
                onError(result.reason);
            }
        }

        let settled = 0;

        if (isSettled) {
            const candidates = new Set([...runs.keys(), ...suspended]);

            for (const runId of candidates) {
                try {
                    if (!await isSettled(runId)) {
                        continue;
                    }
                } catch (error) {
                    onError(error);

                    continue;
                }

                // settled elsewhere while only forgotten: the provider's
                // collection below removes what is left of it
                if (suspended.has(runId) && !runs.has(runId)) {
                    suspended.delete(runId);

                    continue;
                }

                settled += ctx.heldEntries(runId).length;
                await this.releaser.release(runId).catch(onError);
            }
        }

        // the answers of this pass, handed on to the provider (asked once per run)
        const suspendable = new Map<string, Promise<boolean>>();

        if (isSuspendable) {
            for (const runId of runs.keys().toArray()) {
                const entries = runs.get(runId);
                const creating = entries?.values().some((entry) => entry.pending !== undefined) ?? false;

                // released meanwhile, or a create in flight is about to hand its workspace out
                if (!entries || creating) {
                    continue;
                }

                const answer = isSuspendable(runId);

                suspendable.set(runId, answer);

                try {
                    if (!await answer) {
                        continue;
                    }
                } catch (error) {
                    onError(error);

                    continue;
                }

                // the provider suspends them: never dispose, the next get finds them again
                for (const entry of ctx.heldEntries(runId)) {
                    ctx.forget(runId, entry);
                }

                if (!runs.has(runId)) {
                    suspended.add(runId);
                }
            }
        }

        const gcOptions: GarbageCollectOptions = { deployment: ctx.deployment };

        if (isSettled) {
            gcOptions.isSettled = isSettled;
        }

        if (isSuspendable) {
            // the provider never suspends a run this manager still holds
            // anything of (not suspendable, a rejected answer, a pending or
            // a new create): it cannot mark the held handles gone, and their
            // first exec after the resume would fail; the manager forgot
            // every handle of a run it found suspendable
            gcOptions.isSuspendable = (runId) => {
                if (runs.has(runId)) {
                    return Promise.resolve(false);
                }

                return suspendable.get(runId) ?? isSuspendable(runId);
            };
        }

        return counted + settled + await ctx.provider.collectGarbage(gcOptions);
    }

    maybeCollectGarbage(): void {
        const { gcIntervalMs } = this.ctx;

        if (gcIntervalMs === 0) {
            return;
        }

        const now = this.ctx.clock.now();

        if (this.lastGcAt !== undefined && now - this.lastGcAt < gcIntervalMs) {
            return;
        }

        this.collectGarbage().catch(this.ctx.onError);
    }
}
