/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    createApp,
    databaseModule,
    readDatabaseDescriptors,
    storeModule,
} from '@chamvi/app';
import type { IModule } from '@chamvi/app';
import {
    AuthorEntity,
    Init1795000000000,
    MIGRATIONS_DIRECTORY,
    NoteEntity,
    TagEntity,
    Tags1795000000001,
    notesDatabase,
    tagsDatabase,
} from '../../../fixtures/database/index.ts';

describe('readDatabaseDescriptors', () => {
    it('reads the descriptors of an app\'s database modules, in order, without connecting', () => {
        const app = createApp({
            agents: [],
            modules: [databaseModule(notesDatabase()), storeModule(), databaseModule(tagsDatabase())],
        });

        expect(readDatabaseDescriptors(app)).toEqual([
            {
                name: 'default',
                entities: [AuthorEntity, NoteEntity],
                migrations: [Init1795000000000],
                migrationsDirectory: MIGRATIONS_DIRECTORY,
                migrationsTableName: 'notes_migrations',
                lockName: 'chamvi:db:default',
            },
            {
                name: 'tags',
                entities: [TagEntity],
                migrations: [Tags1795000000001],
                migrationsDirectory: MIGRATIONS_DIRECTORY,
                migrationsTableName: 'tags_migrations',
                lockName: 'chamvi:db:tags',
            },
        ]);
    });

    it('a migrations directory given as a path is made absolute against the working directory', () => {
        const app = createApp({ agents: [], modules: [databaseModule(notesDatabase({ migrationsDirectory: 'src/migrations' }))] });

        expect(readDatabaseDescriptors(app)[0]?.migrationsDirectory).toBe(`${process.cwd()}/src/migrations`);
    });

    it('finds a descriptor on a module wrapped by copying its own properties', () => {
        const module = databaseModule(notesDatabase());
        const wrapped = Object.defineProperties<object>({ setup: module.setup.bind(module) }, Object.getOwnPropertyDescriptors(module)) as IModule;
        const app = createApp({ agents: [], modules: [wrapped] });

        expect(readDatabaseDescriptors(app).map((descriptor) => descriptor.name)).toEqual(['default']);
    });

    it('finds a frozen module, and reads the modules the app keeps under its symbol', () => {
        const app = createApp({ agents: [], modules: [Object.freeze(databaseModule(notesDatabase()))] });
        const modules = (app as unknown as Record<symbol, unknown>)[Symbol.for('chamvi.app.modules')];

        expect(Array.isArray(modules)).toBe(true);
        expect(Object.prototype.propertyIsEnumerable.call(app, Symbol.for('chamvi.app.modules'))).toBe(false);
        expect(readDatabaseDescriptors(app).map((descriptor) => descriptor.name)).toEqual(['default']);
        // a stand-in for an App of another installed copy: only the symbol, no protected field
        expect(readDatabaseDescriptors({ [Symbol.for('chamvi.app.modules')]: modules } as never)).toHaveLength(1);
    });

    it('an app without a database module has none', () => {
        expect(readDatabaseDescriptors(createApp({ agents: [] }))).toEqual([]);
    });

    it('is frozen: a reader cannot change what the module connects with', () => {
        const [descriptor] = readDatabaseDescriptors(createApp({ agents: [], modules: [databaseModule(notesDatabase())] }));

        expect(Object.isFrozen(descriptor)).toBe(true);
        expect(Object.isFrozen(descriptor?.entities)).toBe(true);
    });
});
