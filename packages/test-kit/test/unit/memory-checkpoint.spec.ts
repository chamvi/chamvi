/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryCheckpointRepository, MemoryRegistry, MemoryRunRepository } from '@chamvi/store-memory';
import { describeCheckpointRepositoryContract } from '@chamvi/test-kit';

describeCheckpointRepositoryContract({
    name: 'memory',
    async create() {
        const registry = new MemoryRegistry();

        return {
            runs: new MemoryRunRepository({ registry }),
            checkpoints: new MemoryCheckpointRepository({ registry }),
        };
    },
});
