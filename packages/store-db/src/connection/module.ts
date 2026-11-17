/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { ConnectionRecord, IConnectionRepository, Lock } from '@chamvi/store';
import { ConnectionEntity, ConnectionEntryEntity, ConnectionSecretEntity } from '../entities/index.ts';
import { EntityRepositoryAdapter } from '../entity/module.ts';
import type { EntityTransaction } from '../entity/types.ts';
import { DatabaseConnectionEntryRepository } from './entry.ts';
import { DatabaseConnectionFenceRepository } from './fence.ts';
import { fromConnectionEntity, toConnectionEntity } from './helpers.ts';
import { DatabaseConnectionSecretRepository } from './secret.ts';

/**
 * Connections in `chamvi_connections` (`name` unique, `COLLATE "C"`),
 * stored as given, with their entries and secrets as child repositories
 * on the same data source or manager; a transaction binds all of them to
 * its manager. Inside a transaction a single-row read of a connection
 * takes `FOR UPDATE`, `findFence` reads the lease's row of `chamvi_locks`
 * `FOR SHARE`.
 */
export class DatabaseConnectionRepository
    extends EntityRepositoryAdapter<ConnectionRecord, ConnectionEntity>
    implements IConnectionRepository {
    readonly entries: DatabaseConnectionEntryRepository;

    readonly secrets: DatabaseConnectionSecretRepository;

    /** The lock rows, read by `findFence` only. */
    protected fences: DatabaseConnectionFenceRepository;

    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(ConnectionEntity), {
            entity: 'connection',
            alias: 'connection',
            target: ConnectionEntity,
            toEntity: toConnectionEntity,
            fromEntity: fromConnectionEntity,
            related: [
                { target: ConnectionEntryEntity, entity: 'connection_entry' },
                { target: ConnectionSecretEntity, entity: 'connection_secret' },
            ],
        });

        this.entries = new DatabaseConnectionEntryRepository(source);
        this.secrets = new DatabaseConnectionSecretRepository(source);
        this.fences = new DatabaseConnectionFenceRepository(source);
    }

    withManager(manager: EntityManager): this {
        return new DatabaseConnectionRepository(manager) as this;
    }

    async findFence(name: string): Promise<Lock | null> {
        return this.fences.findOneBy({ key: name });
    }

    protected override bindTo(source: EntityRepositoryAdapter<ConnectionRecord, ConnectionEntity>, transaction: EntityTransaction): void {
        super.bindTo(source, transaction);

        const parent = source as DatabaseConnectionRepository;

        this.bindChild(this.entries, parent.entries);
        this.bindChild(this.secrets, parent.secrets);
        this.bindChild(this.fences, parent.fences);
    }
}
