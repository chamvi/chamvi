/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryRegistry, MemoryRunRepository, MemoryStepRepository } from '@chamvi/store-memory';
import { describeStepRepositoryContract } from '@chamvi/test-kit';

describeStepRepositoryContract({
    name: 'memory',
    async create() {
        const registry = new MemoryRegistry();

        return {
            runs: new MemoryRunRepository({ registry }),
            steps: new MemoryStepRepository({ registry }),
        };
    },
});
