/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import type { EffectRecord, IEffectRepository } from '@chamvi/store';
import { EffectEntity } from '../../entities/index.ts';
import { EntityRepositoryAdapter } from '../../entity/module.ts';

/** Recorded effect results in `chamvi_effects`, stored as given; `upsert` replaces by `key`. */
export class DatabaseEffectRepository extends EntityRepositoryAdapter<EffectRecord, EffectEntity> implements IEffectRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(EffectEntity), {
            entity: 'effect',
            alias: 'effect',
            target: EffectEntity,
            upsertKey: ['key'],
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseEffectRepository(manager) as this;
    }
}
