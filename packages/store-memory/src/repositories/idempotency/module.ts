/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IIdempotencyRepository, IdempotencyKey } from '@chamvi/store';
import { removeRowsExpiredBy } from '../../entity/helpers.ts';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/**
 * Idempotency keys in the registry (entity `idempotency_key`, key `id`,
 * `(scope, key)` unique), stored as given. `runId` references no run: a
 * key is claimed before its run is created.
 */
export class MemoryIdempotencyRepository extends MemoryEntityRepository<IdempotencyKey> implements IIdempotencyRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'idempotency_key',
            registry: options.registry,
            key: ['id'],
            unique: [['scope', 'key']],
        });
    }

    async removeExpiredBy(time: Date): Promise<number> {
        return removeRowsExpiredBy<IdempotencyKey>(this, time);
    }
}
