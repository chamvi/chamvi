/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { Engine, defineModelAgent } from '@chamvi/core';
import { assertSchemaMatchesMetadata } from 'typeorm-extension';
import {
    afterEach,
    expect,
    it,
} from 'vitest';
import { testUuid } from '@chamvi/test-kit';
import { TableName } from '../../../src/entities/constants.ts';
import { STORE_MIGRATIONS, migrateStore, pendingMigrations } from '../../../src/schema/index.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';
import { mockModel } from '../../utils/mock-model.ts';
import type { TestDataSourceOptions } from '../../utils/database.ts';
import { createTestServices } from '../../utils/store.ts';

const BASELINE = 'UuidBaseline1794096000000';
const UPGRADE = 'ConnectionsRevisionsItemBytes1794230765000';

/** The unique key that carries each table's natural identity, as Postgres lists the columns. */
const NATURAL_KEYS: [string, string][] = [
    [TableName.CHECKPOINTS, 'run_id'],
    [TableName.IDEMPOTENCY_KEYS, 'scope, key'],
    [TableName.LOCKS, 'key'],
    [TableName.EFFECTS, 'key'],
    [TableName.KV, 'agent, key'],
    [TableName.DOCS, 'agent, collection, document_id'],
    [TableName.ARTIFACTS, 'run_id, key'],
    [TableName.AGENT_REVISIONS, 'agent'],
    [TableName.CONNECTIONS, 'name'],
    [TableName.CONNECTION_ENTRIES, 'connection_id, key'],
    [TableName.CONNECTION_SECRETS, 'connection_id, name'],
    [TableName.CONVERSATIONS, 'key'],
    [TableName.CONVERSATION_ITEMS, 'scope_id, generation, key'],
    [TableName.CONVERSATION_NOTES, 'scope_id, generation, key'],
    [TableName.CONVERSATION_OPERATIONS, 'scope_id, generation, operation_id'],
];

describePostgres('schema', () => {
    const dataSources: DataSource[] = [];

    const create = async (opts?: TestDataSourceOptions) => {
        const dataSource = await createTestDataSource(opts);

        dataSources.push(dataSource);

        return dataSource;
    };

    const tablesIn = async (ds: DataSource, schema: string) => {
        const rows: { table_name: string }[] = await ds.query(
            'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2::text[])',
            [schema, Object.values(TableName)],
        );

        return rows.length;
    };

    const itemColumns = async (ds: DataSource) => {
        const rows: { column_name: string }[] = await ds.query(
            'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1',
            [TableName.CONVERSATION_ITEMS],
        );

        return rows.map((row) => row.column_name);
    };

    /** Undo the migrations after the released baseline (v0.8.0): the schema a deployment upgrades from. */
    const toReleasedBaseline = async (ds: DataSource) => {
        for (let undone = 0; undone < STORE_MIGRATIONS.length - 1; undone++) {
            await ds.undoLastMigration({ transaction: 'each' });
        }

        expect(await pendingMigrations(ds)).toEqual([UPGRADE]);
    };

    afterEach(async () => {
        await Promise.all(dataSources.map((ds) => ds.destroy()));
        dataSources.length = 0;
    });

    it('fresh migration matches metadata', async () => {
        const ds = await create();

        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();
    });

    it('stores a conversation item\'s byte length in a NOT NULL integer column without a default', async () => {
        const ds = await create();
        const rows: {
            data_type: string,
            is_nullable: string,
            column_default: string | null
        }[] = await ds.query(
            'SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
            [TableName.CONVERSATION_ITEMS, 'bytes'],
        );

        expect(rows).toEqual([{
            data_type: 'integer',
            is_nullable: 'NO',
            column_default: null,
        }]);
    });

    it('upgrades existing conversation items from the released baseline with their byte length', async () => {
        const ds = await create();
        const scopeId = testUuid('scope');
        const runId = testUuid('run');
        // every shape the service stores: a user input, emits with and without effect key and target, pending, sent and unknown
        const items = [
            {
                key: 'user:a',
                role: 'user',
                text: 'plain ascii',
                status: 'sent',
            },
            {
                key: 'assistant:a:0',
                role: 'assistant',
                text: 'é中€ß',
                status: 'sent',
                effect: 'e0',
                channel: 'chat',
                address: 'room',
            },
            {
                key: 'assistant:a:1',
                role: 'assistant',
                text: '😀🎉 and 𝄞',
                status: 'unknown',
                effect: 'e1',
                channel: 'chat',
                address: '',
            },
            {
                key: 'assistant:a:2',
                role: 'assistant',
                text: 'mixed é 😀 x',
                status: 'pending',
            },
            {
                key: 'user:b',
                role: 'user',
                text: 'x'.repeat(70_000),
                status: 'sent',
            },
            {
                key: 'user:c',
                role: 'user',
                text: '中'.repeat(30_000),
                status: 'sent',
            },
        ];

        await toReleasedBaseline(ds);
        await ds.query(
            `INSERT INTO "${TableName.RUNS}" (id, agent, status, trigger, usage, created_at, updated_at)
             VALUES ($1, 'helper', 'running', $2, $3, now(), now())`,
            [runId, JSON.stringify({
                id: 't',
                agent: 'helper',
                trigger: 'message',
                channel: 'chat',
                payload: {},
                receivedAt: new Date().toISOString(),
            }), JSON.stringify({ inputTokens: 0, outputTokens: 0 })],
        );
        await ds.query(
            `INSERT INTO "${TableName.CONVERSATIONS}" (id, key, agent, channel, account, chat, audience, generation)
             VALUES ($1, $2, 'helper', 'chat', 'main', 'room', 'direct', 0)`,
            [scopeId, 'f'.repeat(64)],
        );

        for (const item of items) {
            await ds.query(
                `INSERT INTO "${TableName.CONVERSATION_ITEMS}"
                 (scope_id, generation, key, run_id, created_at, role, text, status, effect_key, target_channel, target_address)
                 VALUES ($1, 0, $2, $3, now(), $4, $5, $6, $7, $8, $9)`,
                [scopeId, item.key, runId, item.role, item.text, item.status, item.effect ?? null, item.channel ?? null, item.address ?? null],
            );
        }

        await migrateStore(ds);

        const rows: {
            key: string,
            text: string,
            bytes: number
        }[] = await ds.query(
            `SELECT key, text, bytes FROM "${TableName.CONVERSATION_ITEMS}" ORDER BY id`,
        );

        expect(rows.map((row) => row.key)).toEqual(items.map((item) => item.key));

        for (const row of rows) {
            expect(row.bytes, row.key).toBe(Buffer.byteLength(row.text, 'utf8'));
        }

        expect(rows.map((row) => row.bytes)).toEqual([11, 10, 17, 15, 70_000, 90_000]);
        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();

        // rollback and reapply keep the backfilled lengths
        await ds.undoLastMigration({ transaction: 'each' });
        expect(await itemColumns(ds)).not.toContain('bytes');
        await migrateStore(ds);
        expect((await ds.query(`SELECT bytes FROM "${TableName.CONVERSATION_ITEMS}" ORDER BY id`)).map((row: { bytes: number }) => row.bytes))
            .toEqual([11, 10, 17, 15, 70_000, 90_000]);

        const store = createTestServices({ dataSource: ds });
        const scope = {
            id: scopeId,
            generation: 0,
            identity: {
                agent: 'helper',
                channel: 'chat',
                account: 'main',
                chat: 'room',
                audience: 'direct',
            },
        };

        expect((await store.conversationService.findItems(scope, { limit: 10, offset: 0 })).total).toBe(items.length);
    });

    it('the byte length backfill counts UTF-8 bytes on a LATIN1 database too', async () => {
        const ds = await create({ encoding: 'LATIN1' });
        const scopeId = testUuid('scope');
        const runId = testUuid('run');
        // every character LATIN1 holds above ASCII is one byte there and two in UTF-8
        const texts = ['plain ascii', 'é', 'Grüße aus Köln', 'ÿ±µ×÷ ©®°', 'ä'.repeat(70_000)];

        expect((await ds.query('SHOW server_encoding'))[0].server_encoding).toBe('LATIN1');

        // the released baseline, before the backfill
        await ds.undoLastMigration({ transaction: 'each' });
        expect(await pendingMigrations(ds)).toEqual([UPGRADE]);

        await ds.query(
            `INSERT INTO "${TableName.RUNS}" (id, agent, status, trigger, usage, created_at, updated_at)
             VALUES ($1, 'helper', 'running', $2, $3, now(), now())`,
            [runId, JSON.stringify({
                id: 't',
                agent: 'helper',
                trigger: 'message',
                channel: 'chat',
                payload: {},
                receivedAt: new Date().toISOString(),
            }), JSON.stringify({ inputTokens: 0, outputTokens: 0 })],
        );
        await ds.query(
            `INSERT INTO "${TableName.CONVERSATIONS}" (id, key, agent, channel, account, chat, audience, generation)
             VALUES ($1, $2, 'helper', 'chat', 'main', 'room', 'direct', 0)`,
            [scopeId, 'f'.repeat(64)],
        );

        for (const [index, text] of texts.entries()) {
            await ds.query(
                `INSERT INTO "${TableName.CONVERSATION_ITEMS}" (scope_id, generation, key, run_id, created_at, role, text, status)
                 VALUES ($1, 0, $2, $3, now(), 'user', $4, 'sent')`,
                [scopeId, `user:${index}`, runId, text],
            );
        }

        await migrateStore(ds);

        const rows: { text: string; bytes: number }[] = await ds.query(`SELECT text, bytes FROM "${TableName.CONVERSATION_ITEMS}" ORDER BY id`);

        expect(rows.map((row) => row.text)).toEqual(texts);
        expect(rows.map((row) => row.bytes)).toEqual(texts.map((text) => Buffer.byteLength(text, 'utf8')));
        expect(rows.map((row) => row.bytes)).toEqual([11, 2, 17, 17, 140_000]);
    });

    it('every text column of a unique index orders by code point', async () => {
        const ds = await create();
        const offenders = ds.entityMetadatas
            .flatMap((entity) => entity.indices)
            .filter((index) => index.isUnique)
            .flatMap((index) => index.columns)
            .filter((column) => (column.type === 'varchar' || column.type === 'text') && column.collation !== 'C')
            .map((column) => `${column.entityMetadata.tableName}.${column.databaseName}`);

        expect(offenders).toEqual([]);
    });

    it('down then up reapplies', async () => {
        const ds = await create();

        await ds.undoLastMigration({ transaction: 'each' });
        expect(await tablesIn(ds, 'public')).toBe(Object.values(TableName).length - 1);
        expect(await itemColumns(ds)).not.toContain('bytes');
        expect(await pendingMigrations(ds)).toEqual([UPGRADE]);

        await ds.undoLastMigration({ transaction: 'each' });
        expect(await tablesIn(ds, 'public')).toBe(0);
        expect(await pendingMigrations(ds)).toEqual([BASELINE, UPGRADE]);

        await migrateStore(ds);
        expect(await tablesIn(ds, 'public')).toBe(Object.values(TableName).length);
        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();
    });

    it('a follow-up generated migration is empty', async () => {
        const ds = await create();
        const sql = await ds.driver.createSchemaBuilder().log();

        expect(sql.upQueries.map((query) => query.query)).toEqual([]);
    });

    it('every table has a single-column primary key named id', async () => {
        const ds = await create();
        const runner = ds.createQueryRunner();

        try {
            const tables = await runner.getTables(Object.values(TableName));

            expect(tables).toHaveLength(Object.values(TableName).length);

            for (const table of tables) {
                expect(table.primaryColumns.map((column) => column.name), table.name).toEqual(['id']);
            }
        } finally {
            await runner.release();
        }
    });

    it('keeps each natural identity in a unique key', async () => {
        const ds = await create();
        const rows: { tablename: string, indexdef: string }[] = await ds.query(
            'SELECT tablename, indexdef FROM pg_indexes WHERE tablename = ANY($1::text[])',
            [Object.values(TableName)],
        );

        for (const [table, columns] of NATURAL_KEYS) {
            expect(
                rows.some((row) => row.tablename === table && row.indexdef.includes('UNIQUE') && row.indexdef.endsWith(`(${columns})`)),
                `${table} (${columns})`,
            ).toBe(true);
        }
    });

    it('stores fixed conversation fields as columns and only frozen messages as JSONB', async () => {
        const ds = await create();
        const runner = ds.createQueryRunner();

        try {
            const names = [
                TableName.CONVERSATIONS,
                TableName.CONVERSATION_ITEMS,
                TableName.CONVERSATION_NOTES,
                TableName.CONVERSATION_OPERATIONS,
            ];
            const tables = await runner.getTables(names);

            expect(tables.flatMap((table) => table.columns.filter((column) => column.type === 'jsonb')
                .map((column) => `${table.name}.${column.name}`))).toEqual([`${TableName.CONVERSATIONS}.snapshot_messages`]);

            for (const name of [TableName.RUNS, TableName.CHECKPOINTS]) {
                const table = await runner.getTable(name);

                expect(table?.findColumnByName('conversation')).toBeUndefined();
                expect(table?.findColumnByName('conversation_scope_id')?.type).toBe('uuid');
            }
        } finally {
            await runner.release();
        }
    });

    it('indexes the run and conversation foreign key columns', async () => {
        const ds = await create();
        const rows: { tablename: string, indexdef: string }[] = await ds.query(
            'SELECT tablename, indexdef FROM pg_indexes WHERE tablename = ANY($1::text[])',
            [[
                TableName.RUNS,
                TableName.CHECKPOINTS,
                TableName.CONVERSATIONS,
                TableName.CONVERSATION_ITEMS,
                TableName.CONVERSATION_NOTES,
                TableName.CONVERSATION_OPERATIONS,
            ]],
        );
        const leads = (table: string, column: string) => rows.some((row) => row.tablename === table &&
            row.indexdef.includes(`(${column}`));

        expect(leads(TableName.RUNS, 'conversation_scope_id')).toBe(true);
        expect(leads(TableName.RUNS, 'parent_run_id')).toBe(true);
        expect(leads(TableName.CHECKPOINTS, 'conversation_scope_id')).toBe(true);
        expect(leads(TableName.CONVERSATION_ITEMS, 'run_id')).toBe(true);
        expect(leads(TableName.CONVERSATION_NOTES, 'run_id')).toBe(true);
        expect(leads(TableName.CONVERSATION_OPERATIONS, 'run_id')).toBe(true);
        expect(leads(TableName.CONVERSATIONS, 'active_run_id')).toBe(true);
    });

    it('creates the GIN index on docs', async () => {
        const ds = await create();
        const rows: { indexdef: string }[] = await ds.query(
            'SELECT indexdef FROM pg_indexes WHERE indexname = $1',
            ['IDX_chamvi_docs_doc_gin'],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]!.indexdef).toContain('USING gin');
    });

    it('indexes artifacts by run', async () => {
        const ds = await create();
        const rows: { indexdef: string }[] = await ds.query(
            'SELECT indexdef FROM pg_indexes WHERE tablename = $1',
            [TableName.ARTIFACTS],
        );

        expect(rows.some((row) => row.indexdef.includes('(run_id)'))).toBe(true);
    });

    it('upgrades existing connections from the baseline with default config and keeps their entries', async () => {
        const ds = await create();
        const connectionId = testUuid('connection');

        await toReleasedBaseline(ds);
        await ds.query(
            `INSERT INTO "${TableName.CONNECTIONS}" (id, name, type, key_id, wrapped_key, created_at, updated_at)
             VALUES ($1, 'wa', 'whatsapp', 'k1', $2, now(), now())`,
            [connectionId, Buffer.from([1])],
        );
        await ds.query(
            `INSERT INTO "${TableName.CONNECTION_ENTRIES}" (id, connection_id, key, value) VALUES ($1, $2, 'creds', $3)`,
            [testUuid('entry'), connectionId, Buffer.from([2])],
        );

        await migrateStore(ds);

        const store = createTestServices({ dataSource: ds });

        expect(await store.connectionService.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: new Uint8Array([1]),
            settings: {},
            secrets: new Map(),
            revision: 0,
            generation: expect.any(String),
        });
        expect(Array.from((await store.connectionService.findEntry('wa', 'creds'))!)).toEqual([2]);
    });

    it('upgrades existing runs from the released baseline without a revision, and they still start', async () => {
        const ds = await create();
        const runId = testUuid('legacy-run');

        await toReleasedBaseline(ds);
        await ds.query(
            `INSERT INTO "${TableName.RUNS}" (id, agent, status, trigger, usage, created_at, updated_at)
             VALUES ($1, 'triage', 'queued', $2, $3, now(), now())`,
            [
                runId,
                JSON.stringify({
                    id: 't1',
                    agent: 'triage',
                    trigger: 'http',
                    channel: 'http',
                    payload: {},
                    receivedAt: new Date().toISOString(),
                }),
                JSON.stringify({ inputTokens: 0, outputTokens: 0 }),
            ],
        );

        await migrateStore(ds);

        const [row]: { agent_revision: string | null }[] = await ds.query(
            `SELECT agent_revision FROM "${TableName.RUNS}" WHERE id = $1`,
            [runId],
        );

        expect(row?.agent_revision).toBeNull();

        const store = createTestServices({ dataSource: ds });

        expect(await store.runService.findOneOrFail(runId)).not.toHaveProperty('agentRevision');

        const engine = new Engine({
            runService: store.runService,
            stepService: store.stepService,
            checkpointService: store.checkpointService,
            effectService: store.effectService,
            artifactService: store.artifactService,
            stateService: store.stateService,
            agentRevisionService: store.agentRevisionService,
            lockService: store.lockService,
            idempotencyService: store.idempotencyService,
            agents: [],
            onError: () => {},
        });

        await engine.putAgent(defineModelAgent({
            name: 'triage',
            model: mockModel([{ parts: [{ type: 'text', text: 'done' }] }]),
            instructions: 'x',
        }), { revision: 'h1' });

        try {
            await engine.start({ channels: false });
            await engine.idle();
            expect((await store.runService.findOneOrFail(runId)).status).toBe('completed');
        } finally {
            engine.stop();
        }
    });

    it('concurrent starts apply once', async () => {
        const ds = await create({ migrate: false });

        await Promise.all([migrateStore(ds), migrateStore(ds)]);
        await migrateStore(ds);

        const migrations: { name: string }[] = await ds.query('SELECT name FROM migrations ORDER BY id');

        expect(migrations.map((m) => m.name)).toEqual(STORE_MIGRATIONS.map((migration) => migration.name));
        expect(await tablesIn(ds, 'public')).toBe(Object.values(TableName).length);
    });

    it('migrateStore resolves with the names of the migrations it ran, none on a second call', async () => {
        const ds = await create({ migrate: false });

        expect(await migrateStore(ds)).toEqual(STORE_MIGRATIONS.map((migration) => migration.name));
        expect(await migrateStore(ds)).toEqual([]);
    });

    it('two concurrent migrateStore calls report each migration once between them', async () => {
        const ds = await create({ migrate: false });

        const [first, second] = await Promise.all([migrateStore(ds), migrateStore(ds)]);

        expect([...first, ...second]).toEqual(STORE_MIGRATIONS.map((migration) => migration.name));
    });

    it('pendingMigrations lists every migration on an empty database and none after migrateStore', async () => {
        const ds = await create({ migrate: false });

        expect(await pendingMigrations(ds)).toEqual([BASELINE, UPGRADE]);
        await migrateStore(ds);
        expect(await pendingMigrations(ds)).toEqual([]);
    });

    it('pendingMigrations does not create the migrations table', async () => {
        const ds = await create({ migrate: false });

        await pendingMigrations(ds);

        const queryRunner = ds.createQueryRunner();

        try {
            expect(await queryRunner.hasTable('migrations')).toBe(false);
        } finally {
            await queryRunner.release();
        }
    });

    it('works in a custom schema', async () => {
        const ds = await create({ schema: 'other' });

        expect(await tablesIn(ds, 'other')).toBe(Object.values(TableName).length);
        expect(await tablesIn(ds, 'public')).toBe(0);

        await ds.undoLastMigration({ transaction: 'each' });
        expect(await tablesIn(ds, 'other')).toBe(Object.values(TableName).length - 1);
        await ds.undoLastMigration({ transaction: 'each' });
        expect(await tablesIn(ds, 'other')).toBe(0);

        await migrateStore(ds);
        expect(await tablesIn(ds, 'other')).toBe(Object.values(TableName).length);
        expect(await tablesIn(ds, 'public')).toBe(0);
    });

    it('migrateStore needs one connection per call (it migrates on the connection holding the lock)', async () => {
        const within = <T>(promise: Promise<T>) => Promise.race([
            promise,
            new Promise<never>((_resolve, reject) => {
                setTimeout(() => reject(new Error('migrateStore did not finish within 5 s')), 5_000);
            }),
        ]);

        const single = await create({ migrate: false, max: 1 });

        await expect(within(migrateStore(single))).resolves.toEqual(STORE_MIGRATIONS.map((migration) => migration.name));

        const pair = await create({ migrate: false, max: 2 });

        await expect(within(Promise.all([migrateStore(pair), migrateStore(pair)]))).resolves.toHaveLength(2);
        await expect(assertSchemaMatchesMetadata(pair)).resolves.toBeUndefined();
    }, 15_000);
});
