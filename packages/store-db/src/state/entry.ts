/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { IStateRepository, StateEntry } from '@chamvi/store';
import { KvEntity } from '../entities/index.ts';
import { EntityRepositoryAdapter } from '../entity/module.ts';

/** Agent state keys in `chamvi_kv` (`key` `COLLATE "C"`), stored as given; `upsert` replaces by `(agent, key)`. */
export class DatabaseStateRepository extends EntityRepositoryAdapter<StateEntry, KvEntity> implements IStateRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(KvEntity), {
            entity: 'state',
            alias: 'state',
            target: KvEntity,
            upsertKey: ['agent', 'key'],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseStateRepository(manager) as this;
    }
}
