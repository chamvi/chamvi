/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IIdempotencyRepository } from '@chamvi/store';
import type { IClock } from '../clock/index.ts';

export type IdempotencyServiceContext = {
    repository: IIdempotencyRepository;
    /** Read after each locked read: a claim is compared with a fresh time. */
    clock: IClock;
};

/** The outcome of a claim: whether this caller created it, and the run the key belongs to. */
export type IdempotencyClaim = {
    created: boolean;
    runId: string;
};
