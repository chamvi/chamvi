/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ILimitRepository, LimitUse } from '@chamvi/store';
import { removeRowsDatedBy } from '../../entity/helpers.ts';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/**
 * Limit uses in the registry (entity `limit_use`, key `id`,
 * `(scope, key)` unique), stored as given. `createdAt` is compared as an
 * instant in `findMany` filters, as the database's date column.
 */
export class MemoryLimitRepository extends MemoryEntityRepository<LimitUse> implements ILimitRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'limit_use',
            registry: options.registry,
            key: ['id'],
            unique: [['scope', 'key']],
            dates: ['createdAt'],
        });
    }

    async sumWeight(scope: string, since: Date): Promise<number> {
        const rows = await this.findManyBy({ scope });

        return rows
            .filter((row) => row.createdAt.getTime() > since.getTime())
            .reduce((sum, row) => sum + row.weight, 0);
    }

    /** One transaction; a use a transaction in flight moves past `time` stays. */
    async removeCreatedBefore(time: Date): Promise<number> {
        return removeRowsDatedBy<'createdAt', LimitUse>(this, 'createdAt', time);
    }
}
