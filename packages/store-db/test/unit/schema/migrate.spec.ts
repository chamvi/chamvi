/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { assertSchemaMatchesMetadata } from 'typeorm-extension';
import {
    afterEach,
    expect,
    it,
} from 'vitest';
import { createDatabaseStore } from '@chamvi/store-db';
import { testUuid } from '@chamvi/test-kit';
import { TableName } from '../../../src/entities/constants.ts';
import { STORE_MIGRATIONS, migrateStore, pendingMigrations } from '../../../src/schema/index.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';
import type { TestDataSourceOptions } from '../../utils/database.ts';

const BASELINE = 'UuidBaseline1794096000000';
const CONNECTION_CONFIG = 'ConnectionConfig1794230765000';

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

    afterEach(async () => {
        await Promise.all(dataSources.map((ds) => ds.destroy()));
        dataSources.length = 0;
    });

    it('fresh migration matches metadata', async () => {
        const ds = await create();

        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();
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
        expect(await pendingMigrations(ds)).toEqual([CONNECTION_CONFIG]);

        await ds.undoLastMigration({ transaction: 'each' });
        expect(await tablesIn(ds, 'public')).toBe(0);
        expect(await pendingMigrations(ds)).toEqual([BASELINE, CONNECTION_CONFIG]);

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

        await ds.undoLastMigration({ transaction: 'each' });
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

        const store = createDatabaseStore({ dataSource: ds });

        expect(await store.connections.findConfig('wa')).toEqual({
            keyId: 'k1',
            wrappedKey: new Uint8Array([1]),
            settings: {},
            secrets: new Map(),
            revision: 0,
        });
        expect(Array.from((await store.connections.findEntry('wa', 'creds'))!)).toEqual([2]);
    });

    it('concurrent starts apply once', async () => {
        const ds = await create({ migrate: false });

        await Promise.all([migrateStore(ds), migrateStore(ds)]);
        await migrateStore(ds);

        const migrations: { name: string }[] = await ds.query('SELECT name FROM migrations ORDER BY id');

        expect(migrations.map((m) => m.name)).toEqual(STORE_MIGRATIONS.map((migration) => migration.name));
        expect(await tablesIn(ds, 'public')).toBe(Object.values(TableName).length);
    });

    it('pendingMigrations lists every migration on an empty database and none after migrateStore', async () => {
        const ds = await create({ migrate: false });

        expect(await pendingMigrations(ds)).toEqual([BASELINE, CONNECTION_CONFIG]);
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

        await expect(within(migrateStore(single))).resolves.toBeUndefined();

        const pair = await create({ migrate: false, max: 2 });

        await expect(within(Promise.all([migrateStore(pair), migrateStore(pair)]))).resolves.toHaveLength(2);
        await expect(assertSchemaMatchesMetadata(pair)).resolves.toBeUndefined();
    }, 15_000);
});
