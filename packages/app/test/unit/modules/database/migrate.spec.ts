/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { inspect } from 'node:util';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { DatabaseUnavailableError } from '@chamvi/store-db';
import { ControllableClock } from '@chamvi/test-kit';
import type { IContainer } from 'eldin';
import { DataSource } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { assertSchemaMatchesMetadata, withDatabaseLock } from 'typeorm-extension';
import {
    afterEach,
    expect,
    it,
} from 'vitest';
import {
    APP_ERROR_CODE,
    DatabaseToken,
    configModule,
    createApp,
    dataSourceToken,
    databaseModule,
} from '@chamvi/app';
import type { IApp, IModule } from '@chamvi/app';
import { memoryStoreModule } from '@chamvi/app/testing';
import { Misnamed, notesDatabase, tagsDatabase } from '../../../fixtures/database/index.ts';
import { TOKENS, rejectionOf } from '../../../utils/app.ts';
import { createTestDatabaseUrl, describePostgres } from '../../../utils/database.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';
import { freePort } from '../../../utils/port.ts';

const MARKER = 'param-marker-91be';

/** A migration that fails on a missing table, its statement carrying a parameter. */
class Broken1795000000005 implements MigrationInterface {
    name = 'Broken1795000000005';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('INSERT INTO "fixture_missing" ("body") VALUES ($1)', [MARKER]);
    }

    async down(): Promise<void> {
        // nothing to undo: up never succeeds
    }
}

let apps: IApp[] = [];
let admins: DataSource[] = [];

afterEach(async () => {
    await Promise.all(apps.map((app) => app.stop().catch(() => {})));
    await Promise.all(admins.filter((admin) => admin.isInitialized).map((admin) => admin.destroy()));
    apps = [];
    admins = [];
});

async function admin(url: string): Promise<DataSource> {
    const dataSource = new DataSource({ type: 'postgres', url });

    await dataSource.initialize();
    admins.push(dataSource);

    return dataSource;
}

async function rowsOf(dataSource: DataSource, table: string): Promise<string[] | undefined> {
    const [exists] = await dataSource.query('SELECT to_regclass($1) AS name', [table]) as Array<{ name: string | null }>;

    if (exists?.name === null) {
        return undefined;
    }

    const rows = await dataSource.query(`SELECT "name" FROM "${table}" ORDER BY "id"`) as Array<{ name: string }>;

    return rows.map((row) => row.name);
}

async function tableExists(dataSource: DataSource, table: string): Promise<boolean> {
    const [row] = await dataSource.query('SELECT to_regclass($1) AS name', [table]) as Array<{ name: string | null }>;

    return row?.name !== null && row?.name !== undefined;
}

type Built = {
    app: IApp;
    logger: ReturnType<typeof createRecordingLogger>;
    container: () => IContainer;
};

/** An app with `modules` after the config module (and the memory store unless `store` is false), a probe keeping the container. */
function build(modules: IModule[], options: { store?: boolean } = {}): Built {
    const logger = createRecordingLogger(new ControllableClock());
    let captured: IContainer | undefined;
    const keep: IModule = {
        name: 'keep',
        dependencies: modules.map((module) => module.name).filter((name) => name.startsWith('chamvi:db:')),
        async setup(container) {
            captured = container;
        },
    };
    const app = createApp({
        agents: [],
        modules: [
            configModule({ logger }),
            ...(options.store === false ? [] : [memoryStoreModule()]),
            ...modules,
            keep,
        ],
    });

    apps.push(app);

    return {
        app,
        logger,
        container: () => captured!,
    };
}

async function envFor(url: string, extra: Record<string, string> = {}): Promise<Record<string, string>> {
    return {
        HOST: '127.0.0.1',
        PORT: String(await freePort()),
        CHAMVI_TOKENS: TOKENS,
        DATABASE_URL: url,
        ...extra,
    };
}

describePostgres('databaseModule on PostgreSQL', () => {
    it('start runs the pending migrations into the app\'s table', async () => {
        const url = await createTestDatabaseUrl();
        // chamvi's store on the same database: its migrations table stays its own
        const { app, container } = build([databaseModule(notesDatabase())], { store: false });

        await app.start({ env: await envFor(url) });

        const dataSource = container().resolve(DatabaseToken.DATA_SOURCE);

        expect(dataSource.options.type).toBe('postgres');
        await assertSchemaMatchesMetadata(dataSource);

        const check = await admin(url);

        expect(await rowsOf(check, 'notes_migrations')).toEqual(['Init1795000000000']);
        expect(await rowsOf(check, 'migrations')).not.toContain('Init1795000000000');
        expect((await rowsOf(check, 'migrations'))?.length).toBeGreaterThan(0);
        expect(await tableExists(check, 'fixture_notes')).toBe(true);

        // a date column without a type is a timestamp here
        const [column] = await check.query(
            'SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
            ['fixture_notes', 'publishedAt'],
        ) as Array<{ data_type: string }>;

        expect(column?.data_type).toBe('timestamp without time zone');
        expect(dataSource.driver.normalizeType(dataSource.getMetadata('NoteEntity').findColumnWithPropertyName('publishedAt')!))
            .toBe('timestamp without time zone');
    });

    it('installExtensions: false reaches the data source options', async () => {
        const url = await createTestDatabaseUrl();
        const { app, container } = build([databaseModule(notesDatabase({ installExtensions: false, postgres: true }))]);

        await app.start({ env: await envFor(url) });

        const dataSource = container().resolve(DatabaseToken.DATA_SOURCE);

        expect(dataSource.options).toMatchObject({ type: 'postgres', installExtensions: false });
        expect(await rowsOf(await admin(url), 'notes_migrations')).toEqual(['Init1795000000000']);
    });

    it('a second start runs nothing', async () => {
        const url = await createTestDatabaseUrl();
        const first = build([databaseModule(notesDatabase())]);

        await first.app.start({ env: await envFor(url) });
        await first.app.stop();

        const second = build([databaseModule(notesDatabase())]);

        await second.app.start({ env: await envFor(url) });

        expect(await rowsOf(await admin(url), 'notes_migrations')).toEqual(['Init1795000000000']);
    });

    it('two apps starting at once both succeed and the migration ran once', async () => {
        const url = await createTestDatabaseUrl();
        const one = build([databaseModule(notesDatabase())]);
        const two = build([databaseModule(notesDatabase())]);

        await Promise.all([
            one.app.start({ env: await envFor(url) }),
            two.app.start({ env: await envFor(url) }),
        ]);

        expect(await rowsOf(await admin(url), 'notes_migrations')).toEqual(['Init1795000000000']);
    });

    it('CHAMVI_MIGRATE=false with a pending migration fails the start', async () => {
        const url = await createTestDatabaseUrl();
        const { app, logger } = build([databaseModule(notesDatabase())]);

        const error = await rejectionOf(app.start({ env: await envFor(url, { CHAMVI_MIGRATE: 'false' }) }));

        expect(error).toMatchObject({ code: APP_ERROR_CODE.STORE_NOT_MIGRATED });
        expect(error.message).toBe('The database "default" has 1 pending migration(s); run chamvi migrate or set CHAMVI_MIGRATE=true.');
        expect(inspect(error, { depth: 10 })).not.toContain(url);
        expect(logger.lines.join('\n')).not.toContain(new URL(url).password);
        expect(await tableExists(await admin(url), 'notes_migrations')).toBe(false);
    });

    it('app.migrate() migrates the app\'s database after chamvi\'s store and closes it', async () => {
        const url = await createTestDatabaseUrl();
        const events: string[] = [];
        const order: IModule = {
            name: 'order',
            dependencies: ['chamvi:db:default'],
            async setup(container) {
                const dataSource = container.resolve(DatabaseToken.DATA_SOURCE);

                events.push(`store migrated: ${String(await tableExists(dataSource, 'chamvi_runs'))}`);
            },
        };
        const { app, container } = build([databaseModule(notesDatabase()), order], { store: false });

        await app.migrate({ env: { DATABASE_URL: url } });

        expect(events).toEqual(['store migrated: true']);
        expect(container().resolve(DatabaseToken.DATA_SOURCE).isInitialized).toBe(false);

        const check = await admin(url);

        expect(await rowsOf(check, 'notes_migrations')).toEqual(['Init1795000000000']);

        const [sessions] = await check.query(
            'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()',
        ) as Array<{ n: number }>;

        expect(sessions?.n).toBe(0);
    });

    for (const migrate of ['false', 'true']) {
        it(`a check with pending migrations writes nothing (CHAMVI_MIGRATE=${migrate})`, async () => {
            const url = await createTestDatabaseUrl();
            const env = await envFor(url, { CHAMVI_MIGRATE: migrate });
            const check = await admin(url);
            const tablesBefore = await check.query('SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = \'public\'') as Array<{ n: number }>;

            // what chamvi's store module does in the same case, on the same database
            const store = await build([], { store: false }).app.check({ env }).then(() => 'passed', (e: { code?: string }) => e.code);
            const { app } = build([databaseModule(notesDatabase())]);
            const outcome = await app.check({ env }).then(() => 'passed', (e: { code?: string }) => e.code);

            expect(outcome).toBe(store);
            expect(outcome).toBe(migrate === 'true' ? 'passed' : APP_ERROR_CODE.STORE_NOT_MIGRATED);

            const tablesAfter = await check.query('SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = \'public\'') as Array<{ n: number }>;

            expect(tablesAfter).toEqual(tablesBefore);
            expect(await tableExists(check, 'notes_migrations')).toBe(false);
            expect(await tableExists(check, 'fixture_notes')).toBe(false);
        });
    }

    it('a check on a migrated database passes and connects', async () => {
        const url = await createTestDatabaseUrl();
        const first = build([databaseModule(notesDatabase())]);

        await first.app.migrate({ env: { DATABASE_URL: url } });

        const { app } = build([databaseModule(notesDatabase())]);

        await expect(app.check({ env: await envFor(url, { CHAMVI_MIGRATE: 'false' }) })).resolves.toEqual({ issues: [] });
    });

    it('two database modules keep separate tables and locks', async () => {
        const url = await createTestDatabaseUrl();
        const holder = await admin(url);
        const runner = holder.createQueryRunner();
        const { promise: release, resolve: unlock } = Promise.withResolvers<void>();
        const { promise: holding, resolve: held } = Promise.withResolvers<void>();
        // the notes database's lock, held by another connection while the tags database migrates
        const locked = withDatabaseLock(runner, 'chamvi:db:default', async () => {
            held();
            await release;
        });

        await holding;

        try {
            const { app, container } = build([databaseModule(tagsDatabase())]);

            await app.start({ env: await envFor(url) });
            expect(container().resolve(dataSourceToken('tags')).isInitialized).toBe(true);
        } finally {
            unlock();
            await locked;
            await runner.release();
        }

        const both = build([databaseModule(notesDatabase()), databaseModule(tagsDatabase())]);

        await both.app.start({ env: await envFor(url) });

        expect(await rowsOf(holder, 'notes_migrations')).toEqual(['Init1795000000000']);
        expect(await rowsOf(holder, 'tags_migrations')).toEqual(['Tags1795000000001']);
    });

    it('a migration class without a timestamp in its name is a configuration error with TypeORM\'s message', async () => {
        const url = await createTestDatabaseUrl();

        for (const env of [{}, { CHAMVI_MIGRATE: 'false' }] as Array<Record<string, string>>) {
            const { app } = build([databaseModule(notesDatabase({ migrations: [Misnamed] }))]);
            const error = await rejectionOf(app.start({ env: await envFor(url, env) }));

            expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
            expect(error.message).toBe(
                'The database "default": Misnamed migration name is wrong. Migration class name should have a JavaScript timestamp appended.',
            );
        }
    });

    it('a failed migration leaves the lock released and reports DatabaseUnavailableError with the driver\'s code only', async () => {
        const url = await createTestDatabaseUrl();
        const { app, logger } = build([databaseModule(notesDatabase({ migrations: [Broken1795000000005] }))]);

        const error = await rejectionOf(app.start({ env: await envFor(url) }));

        expect(error).toBeInstanceOf(DatabaseUnavailableError);
        expect(error).toMatchObject({
            operation: 'migrate',
            driverCode: '42P01',
            subject: 'Broken1795000000005',
        });
        expect(error.message).toBe('The database could not complete the migrate of Broken1795000000005 (42P01).');
        expect(inspect(error, { depth: 10 })).not.toContain(MARKER);
        expect(logger.lines.join('\n')).not.toContain(MARKER);

        const runner = (await admin(url)).createQueryRunner();

        try {
            await expect(withDatabaseLock(runner, 'chamvi:db:default', async () => 'free', { timeout: 1_000 })).resolves.toBe('free');
        } finally {
            await runner.release();
        }
    });
});
