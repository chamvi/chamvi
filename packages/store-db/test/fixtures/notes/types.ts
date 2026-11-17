/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IEntityRepository } from '@chamvi/store';

/** An app's record: what its service and its repositories exchange. */
export type Note = {
    id: string;
    title: string;
    version: number;
    /** An instant, as an ISO 8601 UTC string (`dateToISOStringTransformer` on the column). */
    dueAt: string;
};

/** The app's port for notes: the generic port (an app adds its own finders here). */
export interface INoteRepository extends IEntityRepository<Note> {}

/** What `NoteService.rename` did. */
export type RenameResult = 'renamed' | 'stale' | 'missing';
