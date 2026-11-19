/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { DatabaseUnavailableError } from '@chamvi/store-db';
import { ControllableClock } from '@chamvi/test-kit';
import type { IContainer } from 'eldin';
import { EntitySchema } from 'typeorm';
import type { DataSource } from 'typeorm';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    AppToken,
    DatabaseModule,
    DatabaseToken,
    configModule,
    createApp,
    dataSourceToken,
    databaseModule,
    readDatabaseDescriptors,
} from '@chamvi/app';
import type { IApp, IModule } from '@chamvi/app';
import { memoryStoreModule } from '@chamvi/app/testing';
import {
    AuthorEntity,
    LateEntity,
    NoteEntity,
    TagEntity,
    notesDatabase,
    tagsDatabase,
} from '../../../fixtures/database/index.ts';
import { TOKENS, rejectionOf } from '../../../utils/app.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';
import { closeServer, freePort, listenOn } from '../../../utils/port.ts';

const START = new Date('2026-11-17T00:00:00Z');

let apps: IApp[] = [];

afterEach(async () => {
    await Promise.all(apps.map((app) => app.stop().catch(() => {})));
    apps = [];
});

type Probe = {
    module: IModule;
    container?: IContainer;
    /** `isInitialized` of the default data source as each hook of the probe saw it. */
    seen: Record<string, boolean>;
};

/** A module after the database modules: keeps the container, records what its hooks see of the data source. */
function probe(after: string[] = ['chamvi:db:default']): Probe {
    const state: Probe = { module: undefined as never, seen: {} };
    const look = (phase: string) => {
        state.seen[phase] = state.container?.resolve(DatabaseToken.DATA_SOURCE).isInitialized ?? false;
    };

    state.module = {
        name: 'probe',
        dependencies: after,
        async setup(container) {
            state.container = container;
            container.registerMany(AppToken.LIFECYCLE_HOOKS, {
                useValue: {
                    name: 'probe',
                    stopping: () => look('stopping'),
                    drained: () => look('drained'),
                },
            });
        },
        async onReady() {
            look('onReady');
        },
    };

    return state;
}

async function envFor(extra: Record<string, string> = {}) {
    const port = await freePort();

    return {
        port,
        env: {
            HOST: '127.0.0.1',
            PORT: String(port),
            CHAMVI_TOKENS: TOKENS,
            ...extra,
        },
    };
}

function build(modules: IModule[]) {
    const clock = new ControllableClock(START);
    const logger = createRecordingLogger(clock);
    const app = createApp({ agents: [], modules: [configModule({ clock, logger }), ...modules] });

    apps.push(app);

    return { app, logger };
}

describe('databaseModule', () => {
    it('is named after its database and depends on the config and store modules', () => {
        expect(databaseModule(notesDatabase())).toMatchObject({ name: 'chamvi:db:default', dependencies: ['chamvi:config', 'chamvi:store'] });
        expect(databaseModule(tagsDatabase()).name).toBe('chamvi:db:tags');
    });

    it('a subclass overriding name keeps the descriptor\'s name, its lock and its data source token', async () => {
        class RenamedDatabaseModule extends DatabaseModule {
            override readonly name = 'renamed';
        }

        const renamed = new RenamedDatabaseModule(tagsDatabase());
        let container: IContainer | undefined;
        const keep: IModule = {
            name: 'keep',
            dependencies: ['renamed'],
            async setup(given) {
                container = given;
            },
        };
        const { app } = build([renamed, keep]);
        const { env } = await envFor();

        expect(renamed.name).toBe('renamed');
        expect(readDatabaseDescriptors(app)).toMatchObject([{ name: 'tags', lockName: 'chamvi:db:tags' }]);

        await app.start({ env });

        expect(container!.resolve(dataSourceToken('tags')).isInitialized).toBe(true);
        expect(container!.resolveAll(DatabaseToken.DESCRIPTORS)).toMatchObject([{ name: 'tags', lockName: 'chamvi:db:tags' }]);
        expect(container!.resolveAll(AppToken.LIFECYCLE_HOOKS).map((hook) => hook.name)).toContain('chamvi:db:tags');
    });

    it('starts on SQLite without DATABASE_URL and serves the entities', async () => {
        const seen = probe();
        const { app } = build([databaseModule(notesDatabase()), seen.module]);
        const { env } = await envFor();

        await app.start({ env });

        const dataSource = seen.container!.resolve(DatabaseToken.DATA_SOURCE);
        const author = { id: randomUUID(), name: 'Ada' };
        const publishedAt = new Date('2026-11-16T10:00:00.000Z');

        expect(dataSource.options.type).toBe('better-sqlite3');
        await dataSource.getRepository(AuthorEntity).insert(author);
        await dataSource.getRepository(NoteEntity).insert({
            id: randomUUID(),
            body: 'first',
            publishedAt,
            authorId: author.id,
        });

        const notes = await dataSource.getRepository(NoteEntity).find({ relations: { author: true } });

        expect(notes).toHaveLength(1);
        expect(notes[0]?.author).toEqual(author);
        expect(notes[0]?.publishedAt).toEqual(publishedAt);
        expect(notes[0]?.createdAt).toBeInstanceOf(Date);
    });

    it('on SQLite, work behind a transaction left open is refused after the module\'s wait limit', async () => {
        const seen = probe();
        const { app } = build([databaseModule(notesDatabase({ waitTimeoutMs: 1 })), seen.module]);
        const { env } = await envFor();

        await app.start({ env });

        const dataSource = seen.container!.resolve(DatabaseToken.DATA_SOURCE);
        const runner = dataSource.createQueryRunner();

        await runner.startTransaction();

        // the guard's own timer, 1 ms: far below the 30 s default
        const error = await dataSource.query('SELECT 1').then(() => undefined, (caught: unknown) => caught);

        expect(error).toMatchObject({ name: 'DatabaseBusyError', holder: 'transaction' });
        expect((error as { waitedMs: number }).waitedMs).toBeLessThan(30_000);

        await runner.rollbackTransaction();
    });

    it('registers the data source under the default token and under a named token', async () => {
        const seen = probe(['chamvi:db:default', 'chamvi:db:tags']);
        const { app } = build([databaseModule(notesDatabase()), databaseModule(tagsDatabase()), seen.module]);
        const { env } = await envFor();

        await app.start({ env });

        const { container } = seen;
        const notes = container!.resolve(DatabaseToken.DATA_SOURCE);
        const tags = container!.resolve(dataSourceToken('tags'));

        expect(dataSourceToken()).toBe(DatabaseToken.DATA_SOURCE);
        expect(dataSourceToken('default')).toBe(DatabaseToken.DATA_SOURCE);
        expect(dataSourceToken('tags')).toBe(dataSourceToken('tags'));
        expect(tags).not.toBe(notes);
        expect(tags.isInitialized).toBe(true);
        expect(tags.hasMetadata(TagEntity)).toBe(true);
        expect(tags.hasMetadata(NoteEntity)).toBe(false);
        expect(container!.resolveAll(DatabaseToken.DESCRIPTORS).map((descriptor) => descriptor.name)).toEqual(['default', 'tags']);
        // chamvi's own data source token is not the app's
        expect(container!.has(AppToken.DATA_SOURCE)).toBe(false);
    });

    it('two modules with one name refuse the build', () => {
        expect(() => createApp({ agents: [], modules: [databaseModule(notesDatabase()), databaseModule(tagsDatabase({ name: 'default' }))] }))
            .toThrow(InvalidAgentDefinitionError);
    });

    it('two modules with one migrations table refuse the start', async () => {
        const { app } = build([databaseModule(notesDatabase()), databaseModule(tagsDatabase({ migrationsTableName: 'notes_migrations' }))]);
        const { env } = await envFor();

        const error = await rejectionOf(app.start({ env }));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toContain('notes_migrations');
    });

    it('closes the data source after the engine drained', async () => {
        const seen = probe();
        const { app } = build([databaseModule(notesDatabase()), seen.module]);
        const { env } = await envFor();

        await app.start({ env });

        const dataSource = seen.container!.resolve(DatabaseToken.DATA_SOURCE);

        await app.stop();

        expect(seen.seen).toEqual({
            onReady: true,
            stopping: true,
            drained: true,
        });
        expect(dataSource.isInitialized).toBe(false);
    });

    it('closes it in teardown when the start failed later', async () => {
        const seen = probe();
        const { app } = build([databaseModule(notesDatabase()), seen.module]);
        const { port, env } = await envFor();
        const taken = await listenOn(port);

        try {
            await expect(app.start({ env })).rejects.toBeInstanceOf(Error);
        } finally {
            await closeServer(taken);
        }

        expect(seen.container!.resolve(DatabaseToken.DATA_SOURCE).isInitialized).toBe(false);
    });

    it('closes it in teardown when a later module failed its setup', async () => {
        const seen = probe();
        const failing: IModule = {
            name: 'failing',
            dependencies: ['probe'],
            async setup() {
                throw new InvalidAgentDefinitionError('failing on purpose');
            },
        };
        const { app } = build([databaseModule(notesDatabase()), seen.module, failing]);
        const { env } = await envFor();

        await expect(app.start({ env })).rejects.toThrow('failing on purpose');
        expect(seen.container!.resolve(DatabaseToken.DATA_SOURCE).isInitialized).toBe(false);
    });

    it('a database that cannot connect fails the start with DatabaseUnavailableError and no url', async () => {
        const marker = `pw${randomUUID().replaceAll('-', '')}`;
        const { app, logger } = build([memoryStoreModule(), databaseModule(notesDatabase())]);
        const { env } = await envFor({ DATABASE_URL: `postgres://app:${marker}@127.0.0.1:1/app` });

        const error = await rejectionOf(app.start({ env }));

        expect(error).toBeInstanceOf(DatabaseUnavailableError);
        expect(error).toMatchObject({ code: 'database_unavailable', operation: 'connect' });
        expect(inspect(error, { depth: 10 })).not.toContain(marker);
        expect(logger.lines.join('\n')).not.toContain(marker);
    });

    it('refuses a date column whose type could not be derived, naming the entity and the property', async () => {
        const { app } = build([databaseModule(notesDatabase({ entities: [AuthorEntity, LateEntity] }))]);
        const { env } = await envFor();

        const error = await rejectionOf(app.start({ env }));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toContain('LateEntity#when');
    });

    it('reports an entity mistake as a configuration error naming the entity', async () => {
        const bare = new EntitySchema<{ title: string }>({
            name: 'bare_note',
            tableName: 'bare_notes',
            columns: { title: { type: 'varchar', length: 64 } },
        });

        for (const [entities, expected] of [
            [[NoteEntity], 'NoteEntity#author'],
            [[AuthorEntity, bare], 'bare_note'],
        ] as const) {
            const { app } = build([databaseModule(notesDatabase({ entities: [...entities] }))]);
            const { env } = await envFor();

            const error = await rejectionOf(app.start({ env }));

            expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
            expect(error.message).toContain(expected);
        }
    });

    it('closes the data source when the engine\'s drain fails', async () => {
        const seen = probe();
        const breaking: IModule = {
            name: 'breaking',
            dependencies: ['probe'],
            async setup() {
                // nothing to set up
            },
            async onReady(container) {
                const engine = container.resolve(AppToken.ENGINE);

                engine.drain = async () => {
                    throw new Error('drain fails');
                };
            },
        };
        const { app } = build([databaseModule(notesDatabase()), seen.module, breaking]);
        const { env } = await envFor();

        await app.start({ env });

        const dataSource = seen.container!.resolve(DatabaseToken.DATA_SOURCE);

        await expect(app.stop()).rejects.toMatchObject({ code: 'app_stop_failed' });
        expect(dataSource.isInitialized).toBe(false);
    });

    it('pins a date column to the driver\'s date type', async () => {
        const seen = probe();
        const { app } = build([databaseModule(notesDatabase()), seen.module]);
        const { env } = await envFor();

        await app.start({ env });

        const dataSource = seen.container!.resolve(DatabaseToken.DATA_SOURCE);
        const metadata = dataSource.getMetadata(NoteEntity);

        // the type came from the decorator metadata (Date); the driver's DDL type of it
        expect(metadata.findColumnWithPropertyName('publishedAt')?.type).toBe(Date);
        expect(dataSource.driver.normalizeType(metadata.findColumnWithPropertyName('publishedAt')!)).toBe('datetime');
        expect(dataSource.driver.normalizeType(metadata.findColumnWithPropertyName('createdAt')!)).toBe('datetime');
    });

    it('a check without DATABASE_URL has a usable data source', async () => {
        let dataSource: DataSource | undefined;
        let count: number | undefined;
        const reader: IModule = {
            name: 'reader',
            dependencies: ['chamvi:db:default'],
            async setup() {
                // reads in onReady, once every module set up
            },
            async onReady(container) {
                dataSource = container.resolve(DatabaseToken.DATA_SOURCE);
                count = await dataSource.getRepository(AuthorEntity).count();
            },
        };
        const { app } = build([databaseModule(notesDatabase()), reader]);
        const { env } = await envFor();

        await expect(app.check({ env })).resolves.toEqual({ issues: [] });
        expect(count).toBe(0);
        expect(dataSource?.isInitialized).toBe(false);
    });

    it('warns outside dev that SQLite in memory loses its rows on a restart', async () => {
        const { app, logger } = build([databaseModule(notesDatabase())]);
        const { env } = await envFor();

        await app.start({ env });

        expect(logger.entries.filter((entry) => entry.level === 'warn').map((entry) => entry.msg))
            .toContain('DATABASE_URL unset: the database "default" runs on SQLite in memory; restarts lose its rows.');
    });
});
