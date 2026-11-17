/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ILockRepository } from '@chamvi/store';
import type { IClock } from '../clock/index.ts';

export type LockServiceContext = {
    repository: ILockRepository;
    /** Read after each locked read: a lease is compared with a fresh time. */
    clock: IClock;
};
