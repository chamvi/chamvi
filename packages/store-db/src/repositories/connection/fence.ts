/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { Lock } from '@chamvi/store';
import { LockEntity } from '../../entities/index.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';

/**
 * The lock rows of `chamvi_locks` as the connection fence reads them:
 * inside a transaction a single-row read takes `FOR SHARE`, which every
 * change of a lease (the lock service's `FOR UPDATE` takeover, renew and
 * release, a purge's DELETE) waits for, and which waits for a change in
 * flight. Internal to the connection repository.
 */
export class DatabaseConnectionFenceRepository extends EntityRepositoryAdapter<Lock, LockEntity> {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(LockEntity), {
            entity: 'lock',
            alias: 'lock',
            target: LockEntity,
            lock: 'share',
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseConnectionFenceRepository(manager) as this;
    }
}
