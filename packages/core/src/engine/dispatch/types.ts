/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '../../clock/index.ts';
import type { Run } from '../../run/types.ts';
import type { IStore } from '../../repository/types.ts';
import type { CancelReason } from '../registry/types.ts';

/** What resume() records and appends: the effect the resumed call reads, and the `wait` step. */
export type ResumeRecord = { key: string; value: unknown };

export type ResumeStep = {
    name: string;
    input: unknown;
    output: unknown
};

/** What the dispatch-wait operations need from the engine. */
export type DispatchEngineContext = {
    store: Pick<IStore, 'runs'>;
    clock: IClock;
    /** How long past an expired wait a requested cancel may take to land before the run reads `timeout`. */
    claimTtlMs: number;
    /**
     * waiting → queued for the wait point `waitId` (guarded by status and wait
     * id), recording `record` and appending the `wait` step; throws
     * InvalidRunStateError when the run no longer waits on it.
     */
    resume: (run: Run, waitId: string, record: ResumeRecord, step: ResumeStep, stale: () => Error) => Promise<void>;
    /** The engine's cancel (a remote run gets `cancelRequested`); InvalidRunStateError for a settled run. */
    cancel: (runId: string, reason?: CancelReason) => Promise<void>;
    onError: (error: unknown, run?: Run) => void;
};
