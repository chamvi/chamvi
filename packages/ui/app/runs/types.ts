/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunWire, StepWire } from '@chamvi/http-kit';
import type { RunStatusLiteral } from '@chamvi/core-kit';

/** The run list a view shows: what it filters by and which page; `toRunQuery` makes the API query of it. */
export type RunListFilter = {
    agent?: string;
    /** Only the runs this run dispatched. */
    parent?: string;
    status?: RunStatusLiteral[];
    /** Only the runs whose wait point is of this kind. */
    waiting?: 'approval' | 'dispatch';
    /** The first local calendar day (`YYYY-MM-DD`, as `VCFormDateRange` emits it) whose runs are listed. */
    from?: string;
    /** The last local calendar day (`YYYY-MM-DD`) whose runs are listed. */
    to?: string;
    limit?: number;
    offset?: number;
};

/** Live model output per model step (the checkpoint index a delta names). */
export type LiveText = { text: string; reasoning: string };

export type RunDetailState = {
    run: RunWire;
    steps: StepWire[];
    live: Record<number, LiveText>;
};
