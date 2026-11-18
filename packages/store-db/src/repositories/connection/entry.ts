/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { ConnectionEntryRecord, IConnectionEntryRepository } from '@chamvi/store';
import { ConnectionEntity, ConnectionEntryEntity } from '../../entities/index.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';
import { fromConnectionEntryEntity, toConnectionEntryEntity } from './helpers.ts';

/**
 * Connection entries in `chamvi_connection_entries` (`key` `COLLATE "C"`,
 * `(connection_id, key)` unique, removed with their connection), stored
 * as given; `upsert` replaces by `(connectionId, key)`.
 */
export class DatabaseConnectionEntryRepository
    extends EntityRepositoryAdapter<ConnectionEntryRecord, ConnectionEntryEntity>
    implements IConnectionEntryRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(ConnectionEntryEntity), {
            entity: 'connection_entry',
            alias: 'connectionEntry',
            target: ConnectionEntryEntity,
            toEntity: toConnectionEntryEntity,
            fromEntity: fromConnectionEntryEntity,
            related: [{ target: ConnectionEntity, entity: 'connection' }],
            upsertKey: ['connectionId', 'key'],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseConnectionEntryRepository(manager) as this;
    }
}
