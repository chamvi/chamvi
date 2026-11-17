/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ILockRepository } from '@chamvi/store';

export type LockRepositoryContractInput = {
    /** Label of the suite, e.g. the driver. */
    name: string;
    /** A fresh, empty lock repository per test. */
    create(): Promise<ILockRepository>;
    /**
     * Resolves once a statement of another caller waits for a row lock a
     * transaction holds: the purge cases issue the purge, wait here, then
     * let the transaction commit. An in-process driver (memory) gives the
     * purge its turn (two microtask turns); a driver whose statements run
     * elsewhere (PostgreSQL) observes the wait in the database.
     */
    untilBlocked(): Promise<void>;
};
