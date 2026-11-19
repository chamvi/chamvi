/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamvi/store';
import { InvalidRunStateError } from '../../errors/index.ts';
import { agentCancelReason } from '../registry/helpers.ts';
import type { EngineStartGuardContext, IEngineStartGuard } from './types.ts';

export class EngineStartGuard implements IEngineStartGuard {
    protected readonly ctx: EngineStartGuardContext;

    readonly staleCancels = new Map<string, Promise<void>>();

    constructor(ctx: EngineStartGuardContext) {
        this.ctx = ctx;
    }

    /**
     * The start guard of one scheduling pass, built from one read of the
     * revision markers (skipped while no agent is registered): a run may
     * start when cancel asked for it, or when its agent is registered here
     * and has no revision (an unstamped run) or is loaded at the stored
     * marker's hash. A stamped run of an agent held without a revision is
     * cancelled once no marker of its agent is stored: no replica holds a
     * revision for it any more.
     */
    async prepareStart(): Promise<(run: Run) => boolean> {
        const {
            agents,
            revisions,
            syncing,
        } = this.ctx.registry;

        // a folder agent's runs start at its marker; an agent without a revision cancels stamped runs without one
        const markers = agents.size > 0 ?
            new Map((await this.ctx.agentRevisionService.find()).map((marker) => [marker.agent, marker.hash])) :
            new Map<string, string>();

        return (run) => {
            if (!this.ctx.isStarted() || this.ctx.isStartAborted()) {
                return false;
            }

            if (run.cancelRequested) {
                return true;
            }

            const agent = agents.get(run.agent);

            if (!agent || !this.ctx.skills.get(agent) || !agents.has(run.agent) || syncing.has(run.agent)) {
                return false;
            }

            const revision = revisions.get(run.agent);

            if (this.replacedSince(run)) {
                this.cancelStale(run, revision);

                return false;
            }

            if (revision === undefined) {
                if (run.agentRevision === undefined) {
                    return true;
                }

                // a stamped run is left for a replica that holds the agent at a revision; without a stored
                // marker none does any more (releaseRevision retired it, or a dispatch committed after that)
                if (!markers.has(run.agent)) {
                    this.cancelStale(run, undefined);
                }

                return false;
            }

            if (revision !== markers.get(run.agent)) {
                return false;
            }

            if (this.isStale(run, revision)) {
                this.cancelStale(run, revision);

                return false;
            }

            return true;
        };
    }

    /**
     * Prunes the checked-run fence against a pass's listing of queued runs.
     * Only entries present before the listing started are pruned: their runs
     * were inserted before it, so a run missing from it is no longer queued
     * (running elsewhere, waiting or settled). An entry added meanwhile (a
     * dispatch the listing may not have seen) is kept for the next pass.
     */
    pruneCheckedRuns(): (queued: readonly Run[]) => void {
        const { checkedRuns } = this.ctx;
        const before = Array.from(checkedRuns.keys());

        return (queued) => {
            const ids = new Set(queued.map((run) => run.id));

            for (const id of before) {
                if (!ids.has(id)) {
                    checkedRuns.delete(id);
                }
            }
        };
    }

    /** Whether a checked dispatch of this engine saw another agent object than the one registered now. */
    replacedSince(run: Run): boolean {
        const checked = this.ctx.checkedRuns.get(run.id);

        return checked !== undefined && checked !== this.ctx.registry.agents.get(run.agent);
    }

    /**
     * Whether a run's stamp (a checked dispatch's revision) is neither the
     * revision this engine holds at the marker's hash nor the agent's former
     * revision. An unstamped run is never stale.
     */
    isStale(run: Run, revision: string): boolean {
        return run.agentRevision !== undefined &&
            run.agentRevision !== revision &&
            run.agentRevision !== this.ctx.registry.formerRevisions.get(run.agent);
    }

    /** Cancels a queued stale run once per engine; a run settled or started meanwhile is left to the cancel's rules. */
    cancelStale(run: Run, revision: string | undefined): void {
        if (this.staleCancels.has(run.id)) {
            return;
        }

        const pending = this.ctx.cancelRun(run.id, agentCancelReason(run.agent, 'replaced', revision))
            .then(() => {
                this.ctx.checkedRuns.delete(run.id);
            })
            .catch((error: unknown) => {
                // settled meanwhile (another replica cancelled it first)
                if (error instanceof InvalidRunStateError) {
                    this.ctx.checkedRuns.delete(run.id);

                    return;
                }

                // the fence stays: the next pass tries again
                this.ctx.onError(error, run);
            })
            .finally(() => {
                this.staleCancels.delete(run.id);
            });

        this.staleCancels.set(run.id, pending);
    }

    /** Whether the registered agent has no revision or is loaded at the stored marker's hash. */
    async isCurrent(name: string): Promise<boolean> {
        if (this.ctx.registry.syncing.has(name)) {
            return false;
        }

        const revision = this.ctx.registry.revisions.get(name);

        if (revision === undefined) {
            return true;
        }

        return (await this.ctx.agentRevisionService.findOne(name))?.hash === revision;
    }
}
