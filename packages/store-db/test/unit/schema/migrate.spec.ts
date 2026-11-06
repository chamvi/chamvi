/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { uuidv7 } from 'uuidv7';
import type { DataSource } from 'typeorm';
import { assertSchemaMatchesMetadata, generateMigration } from 'typeorm-extension';
import { afterEach, expect, it } from 'vitest';
import { STORE_MIGRATIONS, migrateStore, pendingMigrations } from '@chamvi/store-db';
import { TableName } from '../../../src/entities/constants.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';
import type { TestDataSourceOptions } from '../../utils/database.ts';
import { seedRun } from '../../utils/conversation.ts';

const RUN = '019a3f2a-1000-7000-8000-000000000001';

describePostgres('schema', () => {
    const dataSources: DataSource[] = [];

    const create = async (opts?: TestDataSourceOptions) => {
        const dataSource = await createTestDataSource(opts);

        dataSources.push(dataSource);

        return dataSource;
    };

    afterEach(async () => {
        await Promise.all(dataSources.map((ds) => ds.destroy()));
        dataSources.length = 0;
    });

    for (const schema of [undefined, 'other']) {
        it(`creates, reverts and reapplies the generated baseline in ${schema ?? 'public'}`, async () => {
            const ds = await create({ schema });

            if (schema) {
                await ds.destroy();
                await ds.initialize();
            }

            const verify = () => expect(generateMigration({
                dataSource: ds,
                prettify: true,
                preview: true,
            }))
                .resolves.toEqual({ up: [], down: [] });

            await verify();
            expect(await ds.query(`SELECT conname FROM pg_constraint
                WHERE conrelid IN (SELECT oid FROM pg_class WHERE relname = ANY($1))
                AND contype = 'f' AND NOT convalidated`, [Object.values(TableName)])).toEqual([]);
            await ds.undoLastMigration({ transaction: 'each' });
            expect(await pendingMigrations(ds)).toEqual(['Init1793923200000']);
            expect(await ds.query(`SELECT table_name FROM information_schema.tables
                WHERE table_schema = current_schema() AND table_name = ANY($1)`, [Object.values(TableName)])).toEqual([]);
            await migrateStore(ds);
            await verify();
        });
    }

    it('rolls back a partially executed baseline and can retry', async () => {
        const ds = await create({ migrate: false });

        await ds.query('CREATE TABLE failure_probe (doc jsonb)');
        await ds.query('CREATE INDEX "IDX_chamvi_docs_doc_gin" ON failure_probe USING gin (doc)');
        await expect(migrateStore(ds)).rejects.toMatchObject({ driverError: { code: '42P07' } });
        expect(await ds.query(`SELECT table_name FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_name = ANY($1)`, [Object.values(TableName)])).toEqual([]);
        expect(await ds.query('SELECT * FROM migrations')).toEqual([]);
        await ds.query('DROP TABLE failure_probe');
        await migrateStore(ds);
        await expect(generateMigration({
            dataSource: ds,
            prettify: true,
            preview: true,
        }))
            .resolves.toEqual({ up: [], down: [] });
    });

    it('store fixed conversation fields as columns and only frozen messages as JSONB', async () => {
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

            expect(await runner.hasTable('chamvi_conversation_turns')).toBe(false);
            expect(tables.flatMap((table) => table.columns.filter((column) => column.type === 'jsonb')
                .map((column) => `${table.name}.${column.name}`))).toEqual([`${TableName.CONVERSATIONS}.snapshot_messages`]);

            for (const name of [TableName.RUNS, TableName.CHECKPOINTS]) {
                const table = await runner.getTable(name);

                expect(table?.findColumnByName('conversation')).toBeUndefined();
                expect(table?.findColumnByName('conversation_scope_id')?.type).toBe('uuid');
            }

            for (const name of names.slice(1)) {
                const table = tables.find((entry) => entry.name === name)!;

                expect(table.foreignKeys).toHaveLength(2);
                expect(table.foreignKeys.find((key) => key.columnNames.includes('scope_id'))).toMatchObject({
                    columnNames: ['scope_id'],
                    referencedTableName: TableName.CONVERSATIONS,
                    referencedColumnNames: ['id'],
                });
            }
        } finally {
            await runner.release();
        }
    });

    it('rejects orphaned conversation rows while retaining historical generations', async () => {
        const ds = await create();
        const { DatabaseConversationRepository } = await import('@chamvi/store-db');
        const { DEFAULT_CONVERSATION_LIMITS } = await import('@chamvi/core');
        const store = new DatabaseConversationRepository({ dataSource: ds });
        const identity = {
            agent: 'helper',
            channel: 'chat',
            account: 'main',
            chat: 'room',
            audience: 'direct',
        };
        const scope = await store.resolve(identity);

        await seedRun(ds, RUN);
        await store.beginTurn(scope, RUN, 'hello', DEFAULT_CONVERSATION_LIMITS);
        await store.applyNote(scope, {
            kind: 'set',
            id: 'op',
            inputHash: 'hash',
            key: 'topic',
            text: 'hello',
            source: {
                runId: RUN,
                toolCallId: 'call',
                stepIndex: 0,
            },
        });

        const ownedTables = [
            TableName.CONVERSATION_ITEMS,
            TableName.CONVERSATION_NOTES,
            TableName.CONVERSATION_OPERATIONS,
        ];

        for (const table of ownedTables) {
            await expect(ds.query(`UPDATE "${table}" SET scope_id = $1`, [uuidv7()]))
                .rejects.toMatchObject({ driverError: { code: '23503' } });
        }

        await store.endTurn(scope, RUN, []);
        await store.reset(identity, { keepNotes: true });
        expect((await store.findItems(scope, { limit: 10, offset: 0 })).total).toBe(1);
        await expect(ds.query('DELETE FROM chamvi_conversations WHERE id = $1', [scope.id]))
            .rejects.toMatchObject({ driverError: { code: '23503' } });
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

    it('migrateStore is safe to call concurrently and twice', async () => {
        const ds = await create({ migrate: false });

        await Promise.all([migrateStore(ds), migrateStore(ds)]);
        await migrateStore(ds);

        const migrations: { name: string }[] = await ds.query('SELECT name FROM migrations ORDER BY id');

        expect(migrations.map((m) => m.name)).toEqual(STORE_MIGRATIONS.map((migration) => migration.name));

        const tables: { table_name: string }[] = await ds.query(
            'SELECT table_name FROM information_schema.tables WHERE table_name = ANY($1::text[])',
            [Object.values(TableName)],
        );

        expect(tables.map((t) => t.table_name).sort()).toEqual(Object.values(TableName).sort());
    });

    it('pendingMigrations lists every migration on an empty database and none after migrateStore', async () => {
        const ds = await create({ migrate: false });

        expect(await pendingMigrations(ds)).toEqual(['Init1793923200000']);
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
