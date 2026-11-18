/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { ConnectionSecretRecord, IConnectionSecretRepository } from '@chamvi/store';
import { ConnectionEntity, ConnectionSecretEntity } from '../../entities/index.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';
import { fromConnectionSecretEntity, toConnectionSecretEntity } from './helpers.ts';

/**
 * Connection secrets in `chamvi_connection_secrets` (`name` `COLLATE "C"`,
 * `(connection_id, name)` unique, removed with their connection), stored
 * as given; `upsert` replaces by `(connectionId, name)`.
 */
export class DatabaseConnectionSecretRepository
    extends EntityRepositoryAdapter<ConnectionSecretRecord, ConnectionSecretEntity>
    implements IConnectionSecretRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(ConnectionSecretEntity), {
            entity: 'connection_secret',
            alias: 'connectionSecret',
            target: ConnectionSecretEntity,
            toEntity: toConnectionSecretEntity,
            fromEntity: fromConnectionSecretEntity,
            related: [{ target: ConnectionEntity, entity: 'connection' }],
            upsertKey: ['connectionId', 'name'],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseConnectionSecretRepository(manager) as this;
    }
}
