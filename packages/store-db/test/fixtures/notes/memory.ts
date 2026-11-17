/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryEntityRepository } from '@chamvi/store-memory';
import type { MemoryRegistry } from '@chamvi/store-memory';
import type { INoteRepository, Note } from './types.ts';

/** The notes port in memory: a service spec's repository, and the app's when it runs without a database. */
export class MemoryNoteRepository extends MemoryEntityRepository<Note> implements INoteRepository {
    constructor(registry: MemoryRegistry) {
        super({
            entity: 'note',
            registry,
            key: ['id'],
            unique: [['title']],
            dates: ['dueAt'],
        });
    }
}
