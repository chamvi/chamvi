/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    MemoryCheckpointRepository,
    MemoryConversationRepository,
    MemoryRegistry,
    MemoryRunRepository,
} from '@chamvi/store-memory';
import { describeConversationRepositoryContract } from '@chamvi/test-kit';

describeConversationRepositoryContract({
    name: 'memory',
    async create() {
        const registry = new MemoryRegistry();

        return {
            repository: new MemoryConversationRepository({ registry }),
            runs: new MemoryRunRepository({ registry }),
            checkpoints: new MemoryCheckpointRepository({ registry }),
        };
    },
    // in process: two microtask turns bring the waiter to the row lock the transaction holds
    async untilBlocked() {
        await Promise.resolve();
        await Promise.resolve();
    },
});
