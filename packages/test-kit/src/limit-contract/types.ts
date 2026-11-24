/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ILimitRepository } from '@chamvi/store';

export type LimitRepositoryContractInput = {
    /** Label of the suite, e.g. the driver. */
    name: string;
    /** A fresh, empty limit use repository per test. */
    create(): Promise<ILimitRepository>;
    /**
     * Resolves once a statement of another caller waits for a row lock a
     * transaction holds: the purge case issues the purge, waits here, then
     * lets the transaction commit. An in-process driver (memory) gives the
     * purge its turn (two microtask turns); a driver whose statements run
     * elsewhere (PostgreSQL) observes the wait in the database.
     */
    untilBlocked(): Promise<void>;
};
