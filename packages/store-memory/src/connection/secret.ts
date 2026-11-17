/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionSecretRecord, IConnectionSecretRepository } from '@chamvi/store';
import { MemoryEntityRepository } from '../entity/module.ts';
import type { MemoryRepositoryOptions } from '../entity/types.ts';

/**
 * Connection secrets in the registry (entity `connection_secret`, key
 * `id`, `(connectionId, name)` unique, `connectionId` references
 * `connection`), stored as given; `upsert` replaces by
 * `(connectionId, name)`.
 */
export class MemoryConnectionSecretRepository extends MemoryEntityRepository<ConnectionSecretRecord> implements IConnectionSecretRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'connection_secret',
            registry: options.registry,
            key: ['id'],
            unique: [['connectionId', 'name']],
            references: [{ field: 'connectionId', entity: 'connection' }],
            upsertKey: ['connectionId', 'name'],
        });
    }
}
