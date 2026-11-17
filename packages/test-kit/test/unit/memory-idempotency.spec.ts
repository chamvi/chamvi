/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryIdempotencyRepository, MemoryRegistry } from '@chamvi/store-memory';
import { describeIdempotencyRepositoryContract } from '@chamvi/test-kit';

describeIdempotencyRepositoryContract({
    name: 'memory',
    async create() {
        return new MemoryIdempotencyRepository({ registry: new MemoryRegistry() });
    },
    // in process: two microtask turns bring the purge to the row lock the transaction holds
    async untilBlocked() {
        await Promise.resolve();
        await Promise.resolve();
    },
});
