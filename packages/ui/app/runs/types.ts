/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunStatusLiteral } from '@chamvi/store';

/** The run list a view shows: what it filters by and which page; `toRunQuery` makes the API query of it. */
export type RunListFilter = {
    agent?: string;
    /** Only the runs this run dispatched. */
    parent?: string;
    status?: RunStatusLiteral[];
    /** Only the runs whose wait point is of this kind. */
    waiting?: 'approval' | 'dispatch';
    limit?: number;
    offset?: number;
};
