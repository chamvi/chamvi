/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Invoker, RemoteWaitPoint, Run } from '@chamvi/core-kit';
import type { WakeOutcome } from '../../types.ts';

export interface IEngineRemote {
    /**
     * The remote waits among the `waiting` runs `listed` (one tick): an
     * expired one is timed out (store writes only), every other one polled
     * detached, its unannounced remote approval sent again (detached). True
     * when a wait was answered.
     */
    pollWaits(listed: readonly Run[], now: number): Promise<boolean>;
    /** One poll of stand-in `run`'s remote run (once per window across replicas, or at once after a wake). */
    poll(run: Run, waiting: RemoteWaitPoint, signal: AbortSignal): Promise<void>;
    /** Times out the remote wait of `run` and sends the remote cancel once. True when answered. */
    expire(run: Run, waiting: RemoteWaitPoint): Promise<boolean>;
    /** A peer's content-free wake of stand-in `runId` (undefined, nothing written, for anything else). */
    wake(runId: string, invoker: Invoker | undefined): Promise<WakeOutcome | undefined>;
    /** A stand-in that settled `cancelled` passes the cancel on to its remote run (detached, best effort). */
    cancelSettled(run: Run): void;
    /** The in-flight start of stand-in `runId` finishes detached and cancels its remote run: its cancelled settle sends nothing. */
    handOffStart(runId: string): void;
}
