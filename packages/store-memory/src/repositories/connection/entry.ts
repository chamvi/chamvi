/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionEntryRecord, IConnectionEntryRepository } from '@chamvi/store';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/**
 * Connection entries in the registry (entity `connection_entry`, key `id`,
 * `(connectionId, key)` unique, `connectionId` references `connection`),
 * stored as given; `upsert` replaces by `(connectionId, key)`.
 */
export class MemoryConnectionEntryRepository extends MemoryEntityRepository<ConnectionEntryRecord> implements IConnectionEntryRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'connection_entry',
            registry: options.registry,
            key: ['id'],
            unique: [['connectionId', 'key']],
            references: [{ field: 'connectionId', entity: 'connection' }],
            upsertKey: ['connectionId', 'key'],
        });
    }
}
