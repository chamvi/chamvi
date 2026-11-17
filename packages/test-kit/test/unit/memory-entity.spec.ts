/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryEntityRepository, MemoryRegistry } from '@chamvi/store-memory';
import type { EntityContractChild, EntityContractParent, EntityContractRecord } from '@chamvi/test-kit';
import { describeEntityRepositoryContract } from '@chamvi/test-kit';

describeEntityRepositoryContract({
    name: 'memory',
    async create() {
        const registry = new MemoryRegistry();

        return {
            parents: new MemoryEntityRepository<EntityContractParent>({
                entity: 'parent',
                registry,
                key: ['id'],
                unique: [['name']],
            }),
            children: new MemoryEntityRepository<EntityContractChild>({
                entity: 'child',
                registry,
                key: ['id'],
                references: [{ field: 'parentId', entity: 'parent' }],
            }),
            records: new MemoryEntityRepository<EntityContractRecord>({
                entity: 'record',
                registry,
                key: ['id'],
                unique: [['scope', 'name']],
                upsertKey: ['scope', 'name'],
            }),
        };
    },
});
