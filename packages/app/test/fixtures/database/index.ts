/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { fileURLToPath } from 'node:url';
import type { DatabaseModuleOptions } from '@chamvi/app';
import { AuthorEntity, NoteEntity, TagEntity } from './entities.ts';
import { Init1795000000000, Tags1795000000001 } from './migrations/index.ts';

export * from './authors.ts';
export * from './entities.ts';
export * from './migrations/index.ts';
export * from './misnamed.ts';
export * from './untyped.ts';

export const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('./migrations', import.meta.url));

/** The notes database: two entities, one migration, its own migrations table. */
export function notesDatabase(options: Partial<DatabaseModuleOptions> = {}): DatabaseModuleOptions {
    return {
        entities: [AuthorEntity, NoteEntity],
        migrations: [Init1795000000000],
        migrationsDirectory: new URL('./migrations/', import.meta.url),
        migrationsTableName: 'notes_migrations',
        ...options,
    };
}

/** A second database, named `tags`. */
export function tagsDatabase(options: Partial<DatabaseModuleOptions> = {}): DatabaseModuleOptions {
    return {
        name: 'tags',
        entities: [TagEntity],
        migrations: [Tags1795000000001],
        migrationsDirectory: MIGRATIONS_DIRECTORY,
        migrationsTableName: 'tags_migrations',
        ...options,
    };
}
