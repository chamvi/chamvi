/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryRegistry, MemoryRunRepository } from '@chamvi/store-memory';
import { describeRunRepositoryContract } from '@chamvi/test-kit';

describeRunRepositoryContract({
    name: 'memory',
    async create() {
        return new MemoryRunRepository({ registry: new MemoryRegistry() });
    },
});
