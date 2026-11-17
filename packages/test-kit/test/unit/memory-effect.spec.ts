/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryEffectRepository, MemoryRegistry } from '@chamvi/store-memory';
import { describeEffectRepositoryContract } from '@chamvi/test-kit';

describeEffectRepositoryContract({
    name: 'memory',
    async create() {
        return new MemoryEffectRepository({ registry: new MemoryRegistry() });
    },
});
