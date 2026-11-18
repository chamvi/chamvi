/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ILockRepository, Lock } from '@chamvi/store';
import { removeRowsExpiredBy } from '../../entity/helpers.ts';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/** Locks in the registry (entity `lock`, key `id`, `key` unique), stored as given. */
export class MemoryLockRepository extends MemoryEntityRepository<Lock> implements ILockRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'lock',
            registry: options.registry,
            key: ['id'],
            unique: [['key']],
        });
    }

    async removeExpiredBy(time: Date): Promise<number> {
        return removeRowsExpiredBy<Lock>(this, time);
    }
}
