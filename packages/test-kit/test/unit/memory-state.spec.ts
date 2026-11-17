/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryRegistry, MemoryStateDocumentRepository, MemoryStateRepository } from '@chamvi/store-memory';
import { describeStateRepositoryContract } from '@chamvi/test-kit';

describeStateRepositoryContract({
    name: 'memory',
    async create() {
        const registry = new MemoryRegistry();

        return {
            entries: new MemoryStateRepository({ registry }),
            documents: new MemoryStateDocumentRepository({ registry }),
        };
    },
});
