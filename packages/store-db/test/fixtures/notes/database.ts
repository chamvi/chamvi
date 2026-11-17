/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import { EntityRepositoryAdapter } from '../../../src/entity/index.ts';
import { NoteEntity } from './entity.ts';
import type { INoteRepository, Note } from './types.ts';

/** The notes port on the app's data source: the adapter base of `@chamvi/store-db`. */
export class DatabaseNoteRepository extends EntityRepositoryAdapter<Note, NoteEntity> implements INoteRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(NoteEntity), {
            entity: 'note',
            alias: 'note',
            target: NoteEntity,
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseNoteRepository(manager) as this;
    }
}
