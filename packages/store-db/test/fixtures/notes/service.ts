/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IQuery } from '@rapiq/core';
import type { EntityFindManyResult } from '@chamvi/store';
import type { INoteRepository, Note, RenameResult } from './types.ts';

/**
 * An app's service: it takes the port, never a driver, so a spec runs it
 * on `MemoryEntityRepository` and on the database adapter alike.
 */
export class NoteService {
    protected repository: INoteRepository;

    constructor(context: { repository: INoteRepository }) {
        this.repository = context.repository;
    }

    async create(id: string, title: string, dueAt = '2026-01-01T00:00:00.000Z'): Promise<Note> {
        return this.repository.save(this.repository.create({
            id,
            title,
            version: 0,
            dueAt,
        }));
    }

    /** Renames the note when it is still at `version`: read locked, check, save, in one transaction. */
    async rename(id: string, version: number, title: string): Promise<RenameResult> {
        return this.repository.transaction(async (repository) => {
            const note = await repository.findOneById(id);

            if (!note) {
                return 'missing';
            }

            if (note.version !== version) {
                return 'stale';
            }

            await repository.save(repository.merge(note, { title, version: version + 1 }));

            return 'renamed';
        });
    }

    async list(query: IQuery): Promise<EntityFindManyResult<Note>> {
        return this.repository.findMany(query);
    }
}
