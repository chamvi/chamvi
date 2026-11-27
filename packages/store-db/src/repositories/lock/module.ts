/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { ILockRepository } from '@chamvi/store';
import type { Lock } from '@chamvi/core-kit';
import { LockEntity } from '../../entities/index.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';
import { removeExpiredBy } from '../../entity/helpers/index.ts';
import { issueLockToken } from './helpers.ts';

/** Locks in `chamvi_locks`, stored as given; tokens from the counter row of `chamvi_lock_tokens`. */
export class DatabaseLockRepository extends EntityRepositoryAdapter<Lock, LockEntity> implements ILockRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(LockEntity), {
            entity: 'lock',
            alias: 'lock',
            target: LockEntity,
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseLockRepository(manager) as this;
    }

    async removeExpiredBy(time: Date): Promise<number> {
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.removeExpiredBy(time));
        }

        return this.persist(() => removeExpiredBy(this.repository, time), 'removeExpiredBy');
    }

    async nextToken(): Promise<number> {
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.nextToken());
        }

        return this.persist(() => issueLockToken(this.repository.manager), 'nextToken');
    }
}
