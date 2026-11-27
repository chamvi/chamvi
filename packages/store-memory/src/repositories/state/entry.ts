/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IStateRepository } from '@chamvi/store';
import type { StateEntry } from '@chamvi/core-kit';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/**
 * Agent state keys in the registry (entity `state`, key `id`,
 * `(agent, key)` unique), stored as given; `upsert` replaces by
 * `(agent, key)`.
 */
export class MemoryStateRepository extends MemoryEntityRepository<StateEntry> implements IStateRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'state',
            registry: options.registry,
            key: ['id'],
            unique: [['agent', 'key']],
            upsertKey: ['agent', 'key'],
        });
    }
}
