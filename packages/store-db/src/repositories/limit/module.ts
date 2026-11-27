/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { LessThanOrEqual } from 'typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import type { ILimitRepository } from '@chamvi/store';
import type { LimitUse } from '@chamvi/core-kit';
import { LimitUseEntity } from '../../entities/index.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';

/**
 * Limit uses in `chamvi_limit_uses`, stored as given. `sumWeight` is one
 * aggregate over the `(scope, created_at)` index.
 */
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

    async sumWeight(scope: string, since: Date): Promise<number> {
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.sumWeight(scope, since));
        }

        const row = await this.persist(() => this.repository
            .createQueryBuilder('limitUse')
            .select('COALESCE(SUM(limitUse.weight), 0)', 'sum')
            .where('limitUse.scope = :scope', { scope })
            .andWhere('limitUse.createdAt > :since', { since })
            .getRawOne<{ sum: string | number }>(), 'sumWeight');

        // SUM over an integer column is a bigint, which the driver reads as a string
        return Number(row?.sum ?? 0);
    }

    /**
     * One statement; a row a transaction holds is checked again once that
     * transaction ended (READ COMMITTED), so a use moved past `time`
     * meanwhile stays.
     */
    async removeCreatedBefore(time: Date): Promise<number> {
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.removeCreatedBefore(time));
        }

        return this.persist(async () => {
            const result = await this.repository.delete({ createdAt: LessThanOrEqual(time) });

            return result.affected ?? 0;
        }, 'removeCreatedBefore');
    }
}
