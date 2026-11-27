/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { IIdempotencyRepository } from '@chamvi/store';
import type { IdempotencyKey } from '@chamvi/core-kit';
import { IdempotencyKeyEntity } from '../../entities/index.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';
import { removeExpiredBy } from '../../entity/helpers/index.ts';

/**
 * Idempotency keys in `chamvi_idempotency_keys`, stored as given. `run_id`
 * has no foreign key: a key is claimed before its run is created.
 */
export class DatabaseIdempotencyRepository extends EntityRepositoryAdapter<IdempotencyKey, IdempotencyKeyEntity> implements IIdempotencyRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(IdempotencyKeyEntity), {
            entity: 'idempotency_key',
            alias: 'idempotencyKey',
            target: IdempotencyKeyEntity,
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseIdempotencyRepository(manager) as this;
    }

    async removeExpiredBy(time: Date): Promise<number> {
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.removeExpiredBy(time));
        }

        return this.persist(() => removeExpiredBy(this.repository, time), 'removeExpiredBy');
    }
}
