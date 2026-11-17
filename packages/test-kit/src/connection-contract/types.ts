/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IConnectionRepository, ILockRepository } from '@chamvi/store';

/** A fresh connection repository and the lock repository whose rows its `findFence` reads. */
export type ConnectionRepositoryContractStore = {
    repository: IConnectionRepository;
    locks: ILockRepository;
};

export type ConnectionRepositoryContractInput = {
    /** Label of the suite, e.g. the driver. */
    name: string;
    /** A fresh, empty connection repository and lock repository on the same storage per test. */
    create(): Promise<ConnectionRepositoryContractStore>;
    /**
     * Resolves once a statement of another caller waits for a row lock a
     * transaction holds: the fence cases start one transaction, wait here,
     * then let the other commit. An in-process driver (memory) gives the
     * waiter its turn (two microtask turns); a driver whose statements run
     * elsewhere (PostgreSQL) observes the wait in the database.
     */
    untilBlocked(): Promise<void>;
};
