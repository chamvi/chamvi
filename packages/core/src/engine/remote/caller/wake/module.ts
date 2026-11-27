/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Invoker } from '@chamvi/core-kit';
import { InvalidRunStateError } from '../../../../errors/index.ts';
import type { WakeOutcome } from '../../../types.ts';
import { remoteWaitOf, updateRemoteWait, withoutRemoteWake } from '../../helpers/index.ts';
import type { RemoteEngineContext } from '../../types.ts';
import type { IEngineRemoteWakes } from './types.ts';

/**
 * The wakes of stand-ins' remote waits: a peer's content-free "check run X
 * now" marks the wait point (`wakeRequested`), and the next poll on any
 * replica takes the mark and reads the remote run regardless of its window.
 */
export class EngineRemoteWakes implements IEngineRemoteWakes {
    protected readonly ctx: RemoteEngineContext;

    constructor(ctx: RemoteEngineContext) {
        this.ctx = ctx;
    }

    /**
     * A peer's content-free "check run X now": marks the remote wait of stand-in
     * `runId` `wakeRequested` (a write conditional on the run still waiting on
     * its remote run), so the next tick on any replica polls it regardless of
     * the window: `marked` when this call set the mark, `pending` when it was
     * set already. `undefined`, with nothing written, unless `runId` is a
     * stand-in waiting on the peer `invoker` authenticates as.
     */
    async mark(runId: string, invoker: Invoker | undefined): Promise<WakeOutcome | undefined> {
        const { ctx } = this;
        const peer = ctx.peers.recognize(invoker);

        if (peer === undefined) {
            return undefined;
        }

        const run = await ctx.runService.findOne(runId);
        const waiting = remoteWaitOf(run);

        if (!waiting || waiting.peer !== peer) {
            return undefined;
        }

        if (waiting.wakeRequested) {
            return 'pending';
        }

        try {
            const updated = await updateRemoteWait(
                ctx.runService,
                runId,
                waiting.id,
                (stored) => {
                    const current = remoteWaitOf(stored);

                    if (!current) {
                        throw new InvalidRunStateError(`Run "${runId}" no longer waits on its remote run.`);
                    }

                    // merged into the stored wait point: a concurrent poll's `remote` state is kept
                    return { waiting: { ...current, wakeRequested: true } };
                },
            );

            ctx.emit(updated);
        } catch (error) {
            if (error instanceof InvalidRunStateError) {
                return undefined;
            }

            throw error;
        }

        return 'marked';
    }

    /**
     * Takes the poll of a woken wait: clears `wakeRequested` with a write
     * conditional on the run still waiting on its remote run and the mark still
     * set (under the row lock, merged into the stored wait point; updatedAt
     * kept, it is the wait step's start). False when the run moved on meanwhile
     * or the mark was taken already.
     */
    async take(runId: string): Promise<boolean> {
        const { ctx } = this;
        const run = await ctx.runService.findOne(runId);
        const waiting = remoteWaitOf(run);

        // gone, or the mark was taken by another replica (its poll is under way)
        if (!waiting?.wakeRequested) {
            return false;
        }

        try {
            const updated = await updateRemoteWait(
                ctx.runService,
                runId,
                waiting.id,
                (stored) => {
                    const current = remoteWaitOf(stored);

                    // taken by another replica since the read: its poll is under way
                    if (!current?.wakeRequested) {
                        throw new InvalidRunStateError(`The wake of run "${runId}" was taken.`);
                    }

                    return { waiting: withoutRemoteWake(current) };
                },
            );

            ctx.emit(updated);
        } catch (error) {
            if (error instanceof InvalidRunStateError) {
                return false;
            }

            throw error;
        }

        return true;
    }
}
