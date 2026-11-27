/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IEffectRepository } from '@chamvi/store';
import type { EffectRecord } from '@chamvi/core-kit';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/**
 * Recorded effect results in the registry (entity `effect`, key `id`,
 * `key` unique), stored as given; `upsert` replaces by `key`.
 */
export class MemoryEffectRepository extends MemoryEntityRepository<EffectRecord> implements IEffectRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'effect',
            registry: options.registry,
            key: ['id'],
            unique: [['key']],
            upsertKey: ['key'],
        });
    }
}
