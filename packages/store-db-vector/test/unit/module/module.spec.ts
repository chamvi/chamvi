/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import {
    APP_ERROR_CODE,
    configModule,
    createApp,
    createLogger,
    readDatabaseDescriptors,
} from '@chamvi/app';
import type { IApp, IModule } from '@chamvi/app';
import { memoryStoreModule } from '@chamvi/app/testing';
import { InvalidAgentDefinitionError, systemClock } from '@chamvi/core';
import { KnowledgeService, defineKnowledgeSource, knowledgeCollection } from '@chamvi/knowledge';
import type { KnowledgeCollection } from '@chamvi/knowledge';
import { KnowledgeToken, knowledgeModule } from '@chamvi/knowledge/module';
import { DatabaseUnavailableError, runMigrationOperation } from '@chamvi/store-db';
import { mockEmbeddingModel } from '@chamvi/test-kit';
import { DataSource } from 'typeorm';
import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    DatabaseKnowledgeRepository,
    KNOWLEDGE_VECTOR_MIGRATIONS,
    KNOWLEDGE_VECTOR_MIGRATIONS_TABLE,
    vectorStoreModule,
} from '@chamvi/store-db-vector';
import fixture from '../../fixtures/migration/entry.ts';
import {
    createTestDataSource,
    createTestDatabase,
    describePostgres,
    postgres,
} from '../../utils/database.ts';

const TOKENS = JSON.stringify([{
    value: 'a-static-token-of-length',
    id: 'ops',
    permissions: '*',
}]);

type Logged = { lines: string[] };

let apps: IApp[] = [];
let dataSources: DataSource[] = [];

afterEach(async () => {
    await Promise.all(apps.map((app) => app.stop().catch(() => {})));
    await Promise.all(dataSources.filter((ds) => ds.isInitialized).map((ds) => ds.destroy()));
    apps = [];
    dataSources = [];
});

/** A loopback port free right now. */
function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();

        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;

            server.close(() => resolve(port));
        });
    });
}

/** A URL of a new, empty database on the test server. */
async function databaseUrl(): Promise<string> {
    const {
        username,
        password,
        host,
        port,
    } = postgres!;

    return `postgres://${username}:${password}@${host}:${port}/${await createTestDatabase()}`;
}

async function envFor(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    return {
        HOST: '127.0.0.1',
        PORT: String(await freePort()),
        CHAMVI_TOKENS: TOKENS,
        ...extra,
    };
}

/** An app of `modules` after the config module (chamvi's store on `DATABASE_URL` unless `memoryStore`). */
function build(modules: IModule[], options: { memoryStore?: boolean } = {}): { app: IApp; logged: Logged } {
    const lines: string[] = [];
    const logger = createLogger({
        level: 'debug',
        write: (line) => {
            lines.push(line);
        },
    });
    const app = createApp({
        agents: [],
        modules: [
            configModule({ logger }),
            ...(options.memoryStore ? [memoryStoreModule()] : []),
            ...modules,
        ],
    });

    apps.push(app);

    return { app, logged: { lines } };
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error & { code?: string }> {
    try {
        await promise;
    } catch (error) {
        return error as Error;
    }

    throw new Error('expected a rejection');
}

async function admin(url: string): Promise<DataSource> {
    const dataSource = new DataSource({ type: 'postgres', url });

    await dataSource.initialize();
    dataSources.push(dataSource);

    return dataSource;
}

/** The migrations recorded in the vector store's table, or undefined without the table. */
async function vectorMigrations(dataSource: DataSource): Promise<string[] | undefined> {
    const [exists] = await dataSource.query('SELECT to_regclass($1) AS name', [KNOWLEDGE_VECTOR_MIGRATIONS_TABLE]) as Array<{ name: string | null }>;

    if (exists?.name === null) {
        return undefined;
    }

    const rows = await dataSource.query(`SELECT "name" FROM "${KNOWLEDGE_VECTOR_MIGRATIONS_TABLE}" ORDER BY "id"`) as Array<{ name: string }>;

    return rows.map((row) => row.name);
}

/** A knowledge service on the vector tables of `url`'s database (already migrated), as the module builds one. */
async function serviceOn(url: string): Promise<KnowledgeService> {
    const dataSource = await createTestDataSource({ database: new URL(url).pathname.slice(1), migrate: false });

    dataSources.push(dataSource);

    return new KnowledgeService({ repository: new DatabaseKnowledgeRepository(dataSource), clock: systemClock });
}

async function waitForCollection(
    service: KnowledgeService,
    name: string,
    predicate: (collection: KnowledgeCollection) => boolean,
): Promise<KnowledgeCollection> {
    let found: KnowledgeCollection | undefined;

    await vi.waitFor(async () => {
        found = await service.findOneCollection(name);

        if (!found || !predicate(found)) {
            throw new Error(`collection ${name} is ${found?.status ?? 'missing'}`);
        }
    }, { timeout: 15_000 });

    return found!;
}

const MIGRATION_NAMES = KNOWLEDGE_VECTOR_MIGRATIONS.map((migration) => migration.name);

describe('vectorStoreModule()', () => {
    it('is the knowledge repository module over the database vector', () => {
        const module = vectorStoreModule();

        expect(module.name).toBe('chamvi:knowledge-repository');
        expect(readDatabaseDescriptors(createApp({ agents: [], modules: [module] }))).toMatchObject([{
            name: 'vector',
            lockName: 'chamvi:db:vector',
            migrationsTableName: 'chamvi_vector_migrations',
            // the package's sources, where generate writes
            migrationsDirectory: fileURLToPath(new URL('../../../src/migrations', import.meta.url)),
        }]);
    });

    it('refuses a url that is no PostgreSQL URL without naming it', () => {
        const secret = `secret${randomUUID().replaceAll('-', '')}`;

        for (const url of [`mysql://user:${secret}@host/db`, `not a url ${secret}`]) {
            const error = (() => {
                try {
                    vectorStoreModule({ url });
                } catch (e) {
                    return e;
                }

                throw new Error('expected a throw');
            })();

            expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
            expect((error as Error).message).toBe('vectorStoreModule() url must be a postgres: or postgresql: URL.');
            expect((error as Error).message).not.toContain(secret);
            expect(inspect(error, { depth: 10 })).not.toContain(secret);
        }
    });

    it('without DATABASE_URL or url the setup is an InvalidAgentDefinitionError', async () => {
        const { app } = build([vectorStoreModule()], { memoryStore: true });

        const error = await rejectionOf(app.start({ env: await envFor() }));

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect(error.message).toBe('The database "vector" needs PostgreSQL: set DATABASE_URL.');
    });

    it('a connection error never contains the password', async () => {
        const password = `secret${randomUUID().replaceAll('-', '')}`;
        const { app, logged } = build([vectorStoreModule({ url: `postgres://user:${password}@127.0.0.1:1/chamvi` })], { memoryStore: true });

        const error = await rejectionOf(app.start({ env: await envFor() }));

        expect(error).toBeInstanceOf(DatabaseUnavailableError);
        expect(inspect(error, { depth: 10 })).not.toContain(password);
        expect(logged.lines.join('\n')).not.toContain(password);
    });
});

describePostgres('vectorStoreModule() on PostgreSQL', () => {
    it('chamvi migrate runs the vector migrations', async () => {
        const url = await databaseUrl();
        const { app } = build([vectorStoreModule()]);

        await app.migrate({ env: { DATABASE_URL: url } });

        const check = await admin(url);

        expect(await vectorMigrations(check)).toEqual(MIGRATION_NAMES);

        const [extension] = await check.query('SELECT extname FROM pg_extension WHERE extname = \'vector\'') as Array<{ extname: string }>;

        expect(extension?.extname).toBe('vector');
    });

    it.each([
        ['true', 'passed'],
        ['false', APP_ERROR_CODE.STORE_NOT_MIGRATED],
    ])('a check with a declared collection on an empty database and CHAMVI_MIGRATE=%s: %s, applying nothing', async (migrate, outcome) => {
        const url = await databaseUrl();
        const { app } = build([
            vectorStoreModule({ url }),
            knowledgeModule({
                collections: [knowledgeCollection('docs', {
                    model: mockEmbeddingModel(),
                    sources: [defineKnowledgeSource({
                        async* documents() {
                            yield { id: 'a', content: 'alpha' };
                        },
                    })],
                })],
                env: {},
            }),
        ], { memoryStore: true });

        const result = await app.check({ env: await envFor({ CHAMVI_MIGRATE: migrate }) })
            .then(() => 'passed', (e: { code?: string; message?: string }) => e.code ?? e.message);

        expect(result).toBe(outcome);

        const check = await admin(url);

        expect(await vectorMigrations(check)).toBeUndefined();
        expect(await check.query('SELECT extname FROM pg_extension WHERE extname = \'vector\'')).toEqual([]);
    });

    it('a check with CHAMVI_MIGRATE=false and pending migrations fails with the hint and applies nothing', async () => {
        const url = await databaseUrl();
        const { app } = build([vectorStoreModule({ url })], { memoryStore: true });

        const error = await rejectionOf(app.check({ env: await envFor({ CHAMVI_MIGRATE: 'false' }) }));

        expect(error).toMatchObject({ code: APP_ERROR_CODE.STORE_NOT_MIGRATED });
        expect(error.message).toBe(`The database "vector" has ${MIGRATION_NAMES.length} pending migration(s); run chamvi migrate or set CHAMVI_MIGRATE=true.`);

        const check = await admin(url);

        expect(await vectorMigrations(check)).toBeUndefined();
        expect(await check.query('SELECT extname FROM pg_extension WHERE extname = \'vector\'')).toEqual([]);
    });

    it('the url option wins over DATABASE_URL and the repository lands under the knowledge token', async () => {
        const url = await databaseUrl();
        let registered: unknown;
        const probe: IModule = {
            name: 'probe',
            dependencies: ['chamvi:knowledge-repository'],
            async setup(container) {
                registered = container.resolve(KnowledgeToken.REPOSITORY);
            },
        };
        const { app } = build([vectorStoreModule({ url }), probe], { memoryStore: true });

        // a closed port: only the option's database is reachable
        await app.start({ env: await envFor({ DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' }) });

        expect(registered).toBeInstanceOf(DatabaseKnowledgeRepository);
        expect(await vectorMigrations(await admin(url))).toEqual(MIGRATION_NAMES);
    });

    it('managed collections and documents survive an app restart', async () => {
        const url = await databaseUrl();
        const first = knowledgeModule({ embeddingModel: mockEmbeddingModel(), env: {} });
        const one = build([vectorStoreModule(), first]);

        await one.app.start({ env: await envFor({ DATABASE_URL: url }) });
        await first.knowledge.createCollection('notes');
        await first.knowledge.putDocument('notes', { id: 'refunds', content: 'A refund is paid within 30 days.' });

        const service = await serviceOn(url);

        await vi.waitFor(async () => {
            expect((await service.findOneDocument('notes', 'refunds'))?.status).toBe('ready');
        }, { timeout: 15_000 });
        await one.app.stop();

        const model = mockEmbeddingModel();
        const second = knowledgeModule({ embeddingModel: model, env: {} });
        const two = build([vectorStoreModule(), second]);

        await two.app.start({ env: await envFor({ DATABASE_URL: url }) });

        expect(second.knowledge.repository).toBeInstanceOf(DatabaseKnowledgeRepository);

        const collection = await service.findOneCollectionOrFail('notes');

        expect(collection).toMatchObject({ kind: 'managed', status: 'ready' });
        expect(await service.findOneDocument('notes', 'refunds')).toMatchObject({
            content: 'A refund is paid within 30 days.',
            status: 'ready',
        });

        const { embeddings: [query] } = await model.doEmbed({ values: ['refund paid'] });
        const matches = await service.search('notes', collection.generation, query!, { topK: 3 });

        expect(matches.map((match) => match.document)).toEqual(['refunds']);
    });

    it('two apps on one database embed a declared collection\'s documents once', async () => {
        const url = await databaseUrl();
        const model = mockEmbeddingModel();
        const documents = [
            { id: 'refunds', content: 'A refund is paid within 30 days.' },
            { id: 'pods', content: 'Kubernetes pods run containers.' },
        ];
        const reads: number[][] = [[], []];
        const declare = (app: number) => knowledgeModule({
            collections: [knowledgeCollection('docs', {
                model,
                sources: [defineKnowledgeSource({
                    async* documents() {
                        reads[app]!.push(Date.now());
                        yield* documents;
                    },
                })],
            })],
            env: {},
        });

        const one = build([vectorStoreModule(), declare(0)]);
        const two = build([vectorStoreModule(), declare(1)]);

        // the store's migrations run once under its lock, the vector chain under chamvi:db:vector
        await Promise.all([
            one.app.start({ env: await envFor({ DATABASE_URL: url }) }),
            two.app.start({ env: await envFor({ DATABASE_URL: url }) }),
        ]);

        const service = await serviceOn(url);

        // both apps ran a pass over the source, and the pass that read last has finished
        await vi.waitFor(() => {
            expect(reads[0]!.length).toBeGreaterThan(0);
            expect(reads[1]!.length).toBeGreaterThan(0);
        }, { timeout: 15_000 });

        const lastRead = Math.max(...reads.flat());

        await waitForCollection(service, 'docs', (found) => found.status === 'ready' && (found.syncedAt?.getTime() ?? 0) >= lastRead);
        await Promise.all([one.app.stop(), two.app.stop()]);

        const embedded = model.calls.flatMap((call) => call.values).filter((value) => documents.some((document) => value.includes(document.content)));

        expect(embedded).toHaveLength(documents.length);
        expect(await vectorMigrations(await admin(url))).toEqual(MIGRATION_NAMES);
    });

    it('chamvi migration drift --database vector exits 0 on a migrated database', async () => {
        const url = await databaseUrl();
        const { app } = build([vectorStoreModule()]);

        await app.migrate({ env: { DATABASE_URL: url } });

        const lines: string[] = [];
        // what the command runs: the descriptors of the generation fixture's app, on DATABASE_URL
        const code = await runMigrationOperation({
            operation: 'drift',
            descriptors: readDatabaseDescriptors(fixture),
            database: 'vector',
            url,
            write: (line) => {
                lines.push(line);
            },
        });

        expect(lines).toEqual(['The database "vector" matches its entities.']);
        expect(code).toBe(0);
    });
});
