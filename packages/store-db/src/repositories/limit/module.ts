/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { ILimitRepository, LimitUse } from '@chamvi/store';
import { LimitUseEntity } from '../../entities/index.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';
import { removeExpiredBy } from '../../entity/helpers/index.ts';

/** Limit uses in `chamvi_limit_uses`, stored as given. */
export class DatabaseLimitRepository extends EntityRepositoryAdapter<LimitUse, LimitUseEntity> implements ILimitRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(LimitUseEntity), {
            entity: 'limit_use',
            alias: 'limitUse',
            target: LimitUseEntity,
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseLimitRepository(manager) as this;
    }

    async removeExpiredBy(time: Date): Promise<number> {
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.removeExpiredBy(time));
        }

        return this.persist(() => removeExpiredBy(this.repository, time), 'removeExpiredBy');
    }
}
