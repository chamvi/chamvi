/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { inspect } from 'node:util';
import {
    APPROVAL_TIMEOUT_MAX_MS,
    AgentRevisionService,
    ArtifactService,
    CheckpointService,
    ConnectionService,
    ConversationService,
    EffectService,
    IdempotencyService,
    InvalidAgentDefinitionError,
    LockService,
    RunService,
    StateService,
    StepService,
} from '@chamvi/core';
import {
    DatabaseAgentRevisionRepository,
    DatabaseArtifactRepository,
    DatabaseCheckpointRepository,
    DatabaseConnectionRepository,
    DatabaseConversationRepository,
    DatabaseEffectRepository,
    DatabaseIdempotencyRepository,
    DatabaseLimitRepository,
    DatabaseLockRepository,
    DatabaseRunRepository,
    DatabaseStateDocumentRepository,
    DatabaseStateRepository,
    DatabaseStepRepository,
    STORE_ENTITIES,
    STORE_MIGRATIONS,
} from '@chamvi/store-db';
import { ControllableClock } from '@chamvi/test-kit';
import { DataSource, QueryFailedError } from 'typeorm';
import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    APP_ERROR_CODE,
    AppToken,
    DEFAULT_PURGE_INTERVAL_MS,
    componentsModule,
    configModule,
    runHooks,
    storeModule,
} from '@chamvi/app';
import type { AppMode, StoreModuleOptions } from '@chamvi/app';
import { createStoppedError } from '../../../../src/module/helpers/index.ts';
import { STORE_CONNECT_TIMEOUT_MS } from '../../../../src/modules/repository/constants.ts';
import { StoreModule } from '../../../../src/modules/repository/module.ts';
import { buildHarness } from '../../../utils/harness.ts';
import { createRecordingLogger } from '../../../utils/logger.ts';
import { createTestDatabaseUrl, describePostgres } from '../../../utils/database.ts';


function build(options: {
    mode?: AppMode;
    check?: boolean;
    env?: Record<string, string>;
    store?: StoreModuleOptions;
}) {
    const clock = new ControllableClock();
    const logger = createRecordingLogger(clock);
    const harness = buildHarness({
        mode: options.mode ?? 'start',
        ...(options.check && { check: true }),
        env: { ...options.env },
        // the components module runs the store's purge
        modules: [configModule({ clock, logger }), storeModule(options.store), componentsModule()],
    });

    return {
        harness,
        clock,
        logger,
    };
}

let admin: DataSource | undefined;

async function openAdmin(url: string): Promise<DataSource> {
    admin = new DataSource({ type: 'postgres', url });
    await admin.initialize();

    return admin;
}

async function closeAdmin(): Promise<void> {
    if (admin?.isInitialized) {
        await admin.destroy();
    }

    admin = undefined;
}

/** A fresh database owned by a new role whose password is `password`, as a URL of that role. */
async function createUrlWithPassword(password: string): Promise<string> {
    const url = new URL(await createTestDatabaseUrl());
    const role = `chamvi_role_${randomUUID().replaceAll('-', '')}`;
    const database = url.pathname.slice(1);
    const seed = new DataSource({ type: 'postgres', url: url.href });

    await seed.initialize();

    try {
        await seed.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
        await seed.query(`ALTER DATABASE "${database}" OWNER TO "${role}"`);
    } finally {
        await seed.destroy();
    }

    url.username = role;
    url.password = password;

    return url.href;
}

async function tableExists(dataSource: DataSource, table: string): Promise<boolean> {
    const rows: Array<{ exists: string | null }> = await dataSource.query('SELECT to_regclass($1) AS exists', [table]);

    return rows[0]?.exists !== null;
}

describe('storeModule on a database URL', () => {
    it('an unreachable DATABASE_URL fails setup and never shows the password', async () => {
        const { harness, logger } = build({ env: { DATABASE_URL: 'postgres://u:sekr3t@127.0.0.1:1/x' } });

        const error = await harness.setup().then(() => undefined, (e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect(inspect(error, { depth: 5 })).not.toContain('sekr3t');
        expect(logger.lines.join('\n')).not.toContain('sekr3t');
        expect(inspect(harness.reported, { depth: 5 })).not.toContain('sekr3t');
        expect(harness.container.has(AppToken.RUN_REPOSITORY)).toBe(false);
    });

    it('an unreachable DATABASE_URL fails a check too', async () => {
        const { harness } = build({ check: true, env: { DATABASE_URL: 'postgres://u:sekr3t@127.0.0.1:1/x' } });

        const error = await harness.setup().then(() => undefined, (e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(InvalidAgentDefinitionError);
        expect(inspect(error, { depth: 5 })).not.toContain('sekr3t');
    });

    it('a server that never answers fails setup after the connect timeout', async () => {
        // accepts the TCP connection and never speaks the Postgres protocol (a dropped-packet network)
        const sockets: Socket[] = [];
        const server = createServer((socket) => {
            sockets.push(socket);
        });

        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });

        const { port } = server.address() as AddressInfo;

        class QuickStoreModule extends StoreModule {
            protected override connectTimeoutMs = 200;
        }
        const harness = buildHarness({
            env: { DATABASE_URL: `postgres://u:p@127.0.0.1:${port}/x` },
            modules: [configModule({ logger: createRecordingLogger() }), new QuickStoreModule()],
        });

        try {
            const began = Date.now();

            await expect(harness.setup()).rejects.toBeInstanceOf(Error);
            expect(Date.now() - began).toBeLessThan(5_000);
            expect(harness.container.has(AppToken.RUN_REPOSITORY)).toBe(false);
        } finally {
            sockets.forEach((socket) => socket.destroy());
            await new Promise((resolve) => {
                server.close(resolve);
            });
        }
    });

    it('the default connect timeout ends well inside the force exit', () => {
        expect(STORE_CONNECT_TIMEOUT_MS).toBeGreaterThan(0);
        expect(STORE_CONNECT_TIMEOUT_MS).toBeLessThan(90_000);
    });

    it('an uninitialized dataSource is a definition error', async () => {
        const dataSource = new DataSource({ type: 'postgres', url: 'postgres://u:p@127.0.0.1:1/x' });
        const { harness } = build({ store: { dataSource } });

        await expect(harness.setup()).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
        expect(harness.container.has(AppToken.RUN_REPOSITORY)).toBe(false);
    });

    it('stop during migrate: an aborted context initializes nothing', async () => {
        const { harness } = build({ mode: 'migrate', env: { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' } });

        harness.controller.abort(createStoppedError());

        await expect(harness.setup()).rejects.toMatchObject({ code: APP_ERROR_CODE.STOPPED });
        expect(harness.container.has(AppToken.DATA_SOURCE)).toBe(false);
        expect(harness.container.has(AppToken.RUN_REPOSITORY)).toBe(false);
    });
});

describePostgres('storeModule on Postgres', () => {
    it('migrate mode migrates and closes', async () => {
        const url = await createTestDatabaseUrl();
        const { harness } = build({ mode: 'migrate', env: { DATABASE_URL: url } });

        await harness.setup();

        const dataSource = harness.container.resolve(AppToken.DATA_SOURCE);

        expect(await tableExists(dataSource, 'chamvi_runs')).toBe(true);
        expect(harness.container.resolve(AppToken.RUN_REPOSITORY)).toBeInstanceOf(DatabaseRunRepository);
        expect(harness.container.resolve(AppToken.STORE_KIND)).toBe('database');

        await harness.stop();
        expect(dataSource.isInitialized).toBe(false);
    });

    it('each repository and service resolves on PostgreSQL', async () => {
        const url = await createTestDatabaseUrl();
        const { harness } = build({ env: { DATABASE_URL: url } });

        await harness.setup();

        const { container } = harness;

        expect(container.resolve(AppToken.STORE_KIND)).toBe('database');
        expect(container.resolve(AppToken.RUN_REPOSITORY)).toBeInstanceOf(DatabaseRunRepository);
        expect(container.resolve(AppToken.STEP_REPOSITORY)).toBeInstanceOf(DatabaseStepRepository);
        expect(container.resolve(AppToken.CHECKPOINT_REPOSITORY)).toBeInstanceOf(DatabaseCheckpointRepository);
        expect(container.resolve(AppToken.EFFECT_REPOSITORY)).toBeInstanceOf(DatabaseEffectRepository);
        expect(container.resolve(AppToken.ARTIFACT_REPOSITORY)).toBeInstanceOf(DatabaseArtifactRepository);
        expect(container.resolve(AppToken.STATE_REPOSITORY)).toBeInstanceOf(DatabaseStateRepository);
        expect(container.resolve(AppToken.STATE_DOCUMENT_REPOSITORY)).toBeInstanceOf(DatabaseStateDocumentRepository);
        expect(container.resolve(AppToken.LOCK_REPOSITORY)).toBeInstanceOf(DatabaseLockRepository);
        expect(container.resolve(AppToken.IDEMPOTENCY_REPOSITORY)).toBeInstanceOf(DatabaseIdempotencyRepository);
        expect(container.resolve(AppToken.LIMIT_REPOSITORY)).toBeInstanceOf(DatabaseLimitRepository);
        expect(container.resolve(AppToken.AGENT_REVISION_REPOSITORY)).toBeInstanceOf(DatabaseAgentRevisionRepository);
        expect(container.resolve(AppToken.CONNECTION_REPOSITORY)).toBeInstanceOf(DatabaseConnectionRepository);
        expect(container.resolve(AppToken.CONVERSATION_REPOSITORY)).toBeInstanceOf(DatabaseConversationRepository);

        expect(container.resolve(AppToken.RUN_SERVICE)).toBeInstanceOf(RunService);
        expect(container.resolve(AppToken.STEP_SERVICE)).toBeInstanceOf(StepService);
        expect(container.resolve(AppToken.CHECKPOINT_SERVICE)).toBeInstanceOf(CheckpointService);
        expect(container.resolve(AppToken.EFFECT_SERVICE)).toBeInstanceOf(EffectService);
        expect(container.resolve(AppToken.ARTIFACT_SERVICE)).toBeInstanceOf(ArtifactService);
        expect(container.resolve(AppToken.STATE_SERVICE)).toBeInstanceOf(StateService);
        expect(container.resolve(AppToken.LOCK_SERVICE)).toBeInstanceOf(LockService);
        expect(container.resolve(AppToken.IDEMPOTENCY_SERVICE)).toBeInstanceOf(IdempotencyService);
        expect(container.resolve(AppToken.AGENT_REVISION_SERVICE)).toBeInstanceOf(AgentRevisionService);
        expect(container.resolve(AppToken.CONNECTION_SERVICE)).toBeInstanceOf(ConnectionService);
        expect(container.resolve(AppToken.CONVERSATION_SERVICE)).toBeInstanceOf(ConversationService);

        // a service writes through its repository into the database
        await expect(container.resolve(AppToken.STATE_SERVICE).set('a', 'k', 1)).resolves.toBe(1);
        expect(await container.resolve(AppToken.STATE_REPOSITORY).findOneBy({ agent: 'a', key: 'k' })).toMatchObject({ value: 1 });
        await harness.stop();
    });

    it('start mode migrates', async () => {
        const url = await createTestDatabaseUrl();
        const { harness } = build({ env: { DATABASE_URL: url } });

        await harness.setup();

        await expect(harness.container.resolve(AppToken.RUN_SERVICE).find({})).resolves.toMatchObject({ total: 0 });
        await harness.stop();
    });

    it('a start with MIGRATE=false on an unmigrated database fails with store_not_migrated and writes nothing', async () => {
        const url = await createTestDatabaseUrl();
        const { harness } = build({ env: { DATABASE_URL: url, MIGRATE: 'false' } });

        const error = await harness.setup().then(() => undefined, (e: unknown) => e);

        expect(error).toMatchObject({ code: APP_ERROR_CODE.STORE_NOT_MIGRATED });
        expect((error as Error).message).toBe(
            `The store has ${STORE_MIGRATIONS.length} pending migration(s); run chamvi migrate or set MIGRATE=true.`,
        );

        const ds = await openAdmin(url);

        try {
            expect(await tableExists(ds, 'migrations')).toBe(false);
            expect(await tableExists(ds, 'chamvi_runs')).toBe(false);
        } finally {
            await closeAdmin();
        }
    });

    it('a start with MIGRATE=false on a migrated database starts without migrating', async () => {
        const url = await createTestDatabaseUrl();
        const first = build({ env: { DATABASE_URL: url } });

        await first.harness.setup();
        await first.harness.stop();

        const { harness } = build({ env: { DATABASE_URL: url, MIGRATE: 'false' } });

        await harness.setup();

        expect(harness.container.resolve(AppToken.RUN_REPOSITORY)).toBeInstanceOf(DatabaseRunRepository);
        await expect(harness.container.resolve(AppToken.RUN_SERVICE).find({})).resolves.toMatchObject({ total: 0 });
        await harness.stop();
    });

    it('options.url wins over DATABASE_URL', async () => {
        const url = await createTestDatabaseUrl();
        const { harness } = build({ env: { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' }, store: { url } });

        await harness.setup();

        expect(harness.container.resolve(AppToken.RUN_REPOSITORY)).toBeInstanceOf(DatabaseRunRepository);
        expect(harness.container.resolve(AppToken.STORE_KIND)).toBe('database');
        await harness.stop();
    });

    it('a failed migration leaves no open connection', async () => {
        const url = await createTestDatabaseUrl();
        const seed = new DataSource({ type: 'postgres', url });

        await seed.initialize();
        await seed.query('CREATE TABLE "IDX_e7686bb29a31182711655bf5bb" ("id" int)');
        await seed.destroy();

        const { harness } = build({ env: { DATABASE_URL: url } });
        const error = await harness.setup().then(() => undefined, (e: unknown) => e);

        expect(error).toBeInstanceOf(QueryFailedError);
        expect(error).toMatchObject({ driverError: { code: '42P07' } });
        expect((error as Error).message).toMatch(/IDX_e7686bb29a31182711655bf5bb/);
        expect(harness.container.resolve(AppToken.DATA_SOURCE).isInitialized).toBe(false);
        expect(harness.container.has(AppToken.RUN_REPOSITORY)).toBe(false);
    });

    it('a failed migration keeps the TypeORM error for a password found in the stack', async () => {
        const url = await createUrlWithPassword('postgres');
        const seed = new DataSource({ type: 'postgres', url });

        await seed.initialize();
        await seed.query('CREATE TABLE "IDX_e7686bb29a31182711655bf5bb" ("id" int)');
        await seed.destroy();

        const { harness } = build({ env: { DATABASE_URL: url } });
        const error = await harness.setup().then(() => undefined, (e: unknown) => e);

        expect(error).toBeInstanceOf(QueryFailedError);
        expect(error).toMatchObject({ driverError: { code: '42P07' } });
        expect((error as Error).message).toBe('relation "IDX_e7686bb29a31182711655bf5bb" already exists');
    });

    it('a stop after initialize rejects app_stopped, also for a password like "app"', async () => {
        const url = await createUrlWithPassword('app');
        const { harness } = build({ mode: 'migrate', env: { DATABASE_URL: url } });
        const { initialize } = DataSource.prototype;
        const spy = vi.spyOn(DataSource.prototype, 'initialize').mockImplementation(async function (this: DataSource) {
            const result = await initialize.call(this);

            harness.controller.abort(createStoppedError());

            return result;
        });

        try {
            const error = await harness.setup().then(() => undefined, (e: unknown) => e);

            expect(error).toMatchObject({ code: APP_ERROR_CODE.STOPPED, message: 'The app was stopped.' });

            const dataSource = harness.container.resolve(AppToken.DATA_SOURCE);

            expect(dataSource.isInitialized).toBe(false);
            expect(await tableExists(await openAdmin(url), 'chamvi_runs')).toBe(false);
        } finally {
            spy.mockRestore();
            await closeAdmin();
        }
    });

    it('a given dataSource is used and not destroyed', async () => {
        const url = await createTestDatabaseUrl();
        const dataSource = new DataSource({
            type: 'postgres',
            url,
            entities: STORE_ENTITIES,
            migrations: STORE_MIGRATIONS,
        });

        await dataSource.initialize();

        try {
            const { harness } = build({ env: { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' }, store: { dataSource } });

            await harness.setup();

            expect(harness.container.resolve(AppToken.DATA_SOURCE)).toBe(dataSource);

            expect(harness.container.resolve(AppToken.RUN_REPOSITORY)).toBeInstanceOf(DatabaseRunRepository);
            await expect(harness.container.resolve(AppToken.RUN_SERVICE).find({})).resolves.toMatchObject({ total: 0 });

            await harness.stop();
            expect(dataSource.isInitialized).toBe(true);
        } finally {
            await dataSource.destroy();
        }
    });

    it('purge on Postgres', async () => {
        const url = await createTestDatabaseUrl();
        const {
            harness,
            clock,
            logger,
        } = build({ env: { DATABASE_URL: url } });

        await harness.setup();

        await harness.container.resolve(AppToken.LOCK_SERVICE).acquire('lock', 'owner', 1000);

        // two uses no window counts any more (created the longest window a limit can have ago) and a recent one
        const uses = harness.container.resolve(AppToken.LIMIT_REPOSITORY);

        for (const key of ['r1:0:c1', 'r1:0:c2']) {
            await uses.save(uses.create({
                id: randomUUID(),
                scope: 'a:search',
                key,
                weight: 1,
                createdAt: new Date(-APPROVAL_TIMEOUT_MAX_MS),
            }));
        }

        await harness.container.resolve(AppToken.LIMIT_SERVICE).record('a:search', 'r1:0:c3', 1);
        await runHooks(harness.container, 'started');
        clock.advance(DEFAULT_PURGE_INTERVAL_MS);

        // the lock service's purge, then the idempotency service's, then the limit service's
        await vi.waitFor(() => {
            expect(logger.entries.find((entry) => entry.level === 'debug')).toMatchObject({ results: [1, 0, 2] });
        });
        expect(await uses.findOneBy({ scope: 'a:search', key: 'r1:0:c3' })).not.toBeNull();

        await runHooks(harness.container, 'stopping');
        await harness.stop();
    });

    it('check mode on an unmigrated database fails with store_not_migrated and creates nothing', async () => {
        const url = await createTestDatabaseUrl();
        const { harness } = build({ check: true, env: { DATABASE_URL: url, MIGRATE: 'false' } });

        const error = await harness.setup().then(() => undefined, (e: unknown) => e);

        expect(error).toMatchObject({ code: APP_ERROR_CODE.STORE_NOT_MIGRATED });
        expect((error as Error).message).toBe(
            `The store has ${STORE_MIGRATIONS.length} pending migration(s); run chamvi migrate or set MIGRATE=true.`,
        );

        const ds = await openAdmin(url);

        try {
            expect(await tableExists(ds, 'migrations')).toBe(false);
            expect(await tableExists(ds, 'chamvi_runs')).toBe(false);
        } finally {
            await closeAdmin();
        }
    });

    it('check mode with MIGRATE=true passes and migrates nothing', async () => {
        const url = await createTestDatabaseUrl();
        const { harness } = build({ check: true, env: { DATABASE_URL: url, MIGRATE: 'true' } });

        await harness.setup();
        await harness.stop();

        const ds = await openAdmin(url);

        try {
            expect(await tableExists(ds, 'migrations')).toBe(false);
            expect(await tableExists(ds, 'chamvi_runs')).toBe(false);
        } finally {
            await closeAdmin();
        }
    });

    it('start --check exits 1 on an old-schema database with MIGRATE=true', async () => {
        const url = await createTestDatabaseUrl();
        const ds = await openAdmin(url);

        try {
            await ds.query('CREATE TABLE "chamvi_runs" ("id" varchar PRIMARY KEY)');
        } finally {
            await closeAdmin();
        }

        const { harness } = build({ check: true, env: { DATABASE_URL: url, MIGRATE: 'true' } });

        const error = await harness.setup().then(() => undefined, (e: unknown) => e);

        expect(error).toMatchObject({ code: 'store_legacy_schema' });
        expect((error as Error).message).toContain('cannot be upgraded in place');
    });

    it('a start with MIGRATE=false refuses an old-schema database', async () => {
        const url = await createTestDatabaseUrl();
        const ds = await openAdmin(url);

        try {
            await ds.query('CREATE TABLE "chamvi_runs" ("id" varchar PRIMARY KEY)');
        } finally {
            await closeAdmin();
        }

        const { harness } = build({ env: { DATABASE_URL: url, MIGRATE: 'false' } });

        await expect(harness.setup()).rejects.toMatchObject({ code: 'store_legacy_schema' });
    });

    it('check mode on a migrated database passes', async () => {
        const url = await createTestDatabaseUrl();
        const first = build({ env: { DATABASE_URL: url } });

        await first.harness.setup();
        await first.harness.stop();

        const { harness } = build({ check: true, env: { DATABASE_URL: url, MIGRATE: 'false' } });

        await harness.setup();
        expect(harness.container.resolve(AppToken.RUN_REPOSITORY)).toBeInstanceOf(DatabaseRunRepository);
        expect(harness.container.resolve(AppToken.STORE_KIND)).toBe('database');
        await harness.stop();
    });
});
