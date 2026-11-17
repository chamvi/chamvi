/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { EntityManager, ObjectLiteral, Repository } from 'typeorm';
import type { EntityRecord } from '@chamvi/store';
import { EntityRepositoryAdapter } from '../../../src/entity/index.ts';
import type { EntityRepositoryAdapterOptions } from '../../../src/entity/index.ts';

/**
 * The smallest adapter on the base: options only, as a repository of a
 * later aggregate is.
 */
export class FixtureRepository<T extends EntityRecord, E extends ObjectLiteral = T> extends EntityRepositoryAdapter<T, E> {
    constructor(repository: Repository<E>, options: EntityRepositoryAdapterOptions<T, E>) {
        super(repository, options);
    }

    withManager(manager: EntityManager): this {
        return new FixtureRepository<T, E>(manager.getRepository(this.options.target), this.options) as this;
    }
}
