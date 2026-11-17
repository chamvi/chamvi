/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryConnectionRepository, MemoryLockRepository, MemoryRegistry } from '@chamvi/store-memory';
import { describeConnectionRepositoryContract } from '@chamvi/test-kit';

describeConnectionRepositoryContract({
    name: 'memory',
    async create() {
        const registry = new MemoryRegistry();

        return {
            repository: new MemoryConnectionRepository({ registry }),
            locks: new MemoryLockRepository({ registry }),
        };
    },
    // in process: two microtask turns bring the waiter to the row lock the transaction holds
    async untilBlocked() {
        await Promise.resolve();
        await Promise.resolve();
    },
});
