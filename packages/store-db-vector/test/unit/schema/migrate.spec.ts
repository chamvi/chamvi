/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    STORE_ENTITIES,
    STORE_MIGRATIONS,
    migrateStore,
    pendingMigrations,
} from '@chamvi/store-db';
import type { DataSource } from 'typeorm';
import { assertSchemaMatchesMetadata } from 'typeorm-extension';
import { afterEach, expect, it } from 'vitest';
import { VectorTableName } from '../../../src/entities/constants.ts';
import {
    KNOWLEDGE_VECTOR_MIGRATIONS,
    KNOWLEDGE_VECTOR_MIGRATIONS_TABLE,
} from '../../../src/schema/index.ts';
import type { TestDataSourceOptions } from '../../utils/database.ts';
import { createTestDataSource, createTestDatabase, describePostgres } from '../../utils/database.ts';

const TABLES = Object.values(VectorTableName);

const VECTOR_MIGRATION_NAMES = KNOWLEDGE_VECTOR_MIGRATIONS.map((migration) => migration.name);

/** The unique keys that carry each table's natural identity, as Postgres lists the columns. */
const NATURAL_KEYS: [string, string][] = [
    [VectorTableName.COLLECTIONS, 'name'],
    [VectorTableName.DOCUMENTS, 'collection_id, id'],
    [VectorTableName.CHUNKS, 'collection_id, document, generation, index'],
];

/** The non-unique indexes the listings and generation deletes read through. */
const INDEXES: [string, string][] = [
    [VectorTableName.DOCUMENTS, 'collection_id, status, id'],
    [VectorTableName.CHUNKS, 'collection_id, generation'],
];

/** Every text column of a unique key or a sort. */
const BYTE_ORDERED: [string, string][] = [
    [VectorTableName.COLLECTIONS, 'name'],
    [VectorTableName.DOCUMENTS, 'id'],
    [VectorTableName.DOCUMENTS, 'status'],
    [VectorTableName.CHUNKS, 'document'],
];

describePostgres('knowledge vector schema', () => {
    const dataSources: DataSource[] = [];

    const create = async (opts?: TestDataSourceOptions) => {
        const dataSource = await createTestDataSource(opts);

        dataSources.push(dataSource);

        return dataSource;
    };

    const extensions = async (ds: DataSource) => {
        const rows: { extname: string }[] = await ds.query('SELECT extname FROM pg_extension WHERE extname = \'vector\'');

        return rows.map((row) => row.extname);
    };

    const tables = async (ds: DataSource) => {
        const rows: { table_name: string }[] = await ds.query(
            'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[]) ORDER BY table_name',
            [TABLES],
        );

        return rows.map((row) => row.table_name);
    };

    const migrationRows = async (ds: DataSource, table: string) => {
        const rows: { name: string }[] = await ds.query(`SELECT name FROM "${table}" ORDER BY id`);

        return rows.map((row) => row.name);
    };

    afterEach(async () => {
        await Promise.all(dataSources.map((ds) => ds.destroy()));
        dataSources.length = 0;
    });

    it('migrates a fresh database, creating the extension and three tables', async () => {
        const ds = await create({ migrate: false });

        expect(await extensions(ds)).toEqual([]);

        await ds.runMigrations({ transaction: 'each' });

        expect(await extensions(ds)).toEqual(['vector']);
        expect(await tables(ds)).toEqual([...TABLES].sort());
        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();
        expect(await migrationRows(ds, KNOWLEDGE_VECTOR_MIGRATIONS_TABLE)).toEqual(VECTOR_MIGRATION_NAMES);

        const indexes: { tablename: string, indexdef: string }[] = await ds.query(
            'SELECT tablename, indexdef FROM pg_indexes WHERE tablename = ANY($1::text[])',
            [TABLES],
        );

        for (const [table, columns] of NATURAL_KEYS) {
            expect(
                indexes.some((row) => row.tablename === table && row.indexdef.includes('UNIQUE') && row.indexdef.endsWith(`(${columns})`)),
                `${table} (${columns})`,
            ).toBe(true);
        }

        for (const [table, columns] of INDEXES) {
            expect(
                indexes.some((row) => row.tablename === table && row.indexdef.endsWith(`(${columns})`)),
                `${table} (${columns})`,
            ).toBe(true);
        }

        const collations: {
            table_name: string,
            column_name: string,
            collation_name: string | null
        }[] = await ds.query(
            'SELECT table_name, column_name, collation_name FROM information_schema.columns WHERE table_name = ANY($1::text[])',
            [TABLES],
        );

        for (const [table, column] of BYTE_ORDERED) {
            expect(
                collations.find((row) => row.table_name === table && row.column_name === column)?.collation_name,
                `${table}.${column}`,
            ).toBe('C');
        }

        const embedding: { udt_name: string, atttypmod: number }[] = await ds.query(
            `SELECT t.typname AS udt_name, a.atttypmod FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
             WHERE a.attrelid = $1::regclass AND a.attname = 'embedding'`,
            [VectorTableName.CHUNKS],
        );

        // a vector without a fixed length: one collection holds the vectors of every model it was embedded with
        expect(embedding).toEqual([{ udt_name: 'vector', atttypmod: -1 }]);

        const fence: {
            data_type: string,
            column_default: string | null,
            is_nullable: string
        }[] = await ds.query(
            'SELECT data_type, column_default, is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = \'fence\'',
            [VectorTableName.COLLECTIONS],
        );

        expect(fence).toEqual([{
            data_type: 'integer',
            column_default: '0',
            is_nullable: 'NO',
        }]);

        const foreignKeys: {
            table: string,
            referenced: string,
            rule: string
        }[] = await ds.query(
            `SELECT c.conrelid::regclass::text AS table, c.confrelid::regclass::text AS referenced, c.confdeltype AS rule
             FROM pg_constraint c WHERE c.contype = 'f' AND c.conrelid::regclass::text = ANY($1::text[]) ORDER BY 1`,
            [TABLES],
        );

        // chunks reference the collection only: they may be written before their document's record
        expect(foreignKeys).toEqual([
            {
                table: VectorTableName.CHUNKS,
                referenced: VectorTableName.COLLECTIONS,
                rule: 'c',
            },
            {
                table: VectorTableName.DOCUMENTS,
                referenced: VectorTableName.COLLECTIONS,
                rule: 'c',
            },
        ]);
    });

    it('a follow-up generated migration is empty', async () => {
        const ds = await create();
        const sql = await ds.driver.createSchemaBuilder().log();

        expect(sql.upQueries.map((query) => query.query)).toEqual([]);
    });

    it('reverts and reapplies', async () => {
        const ds = await create();

        for (let undone = 0; undone < KNOWLEDGE_VECTOR_MIGRATIONS.length; undone++) {
            await ds.undoLastMigration({ transaction: 'each' });
        }

        expect(await tables(ds)).toEqual([]);
        // the extension stays: another schema of the database may use it
        expect(await extensions(ds)).toEqual(['vector']);

        await ds.runMigrations({ transaction: 'each' });

        expect(await tables(ds)).toEqual([...TABLES].sort());
        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();
    });

    it('store-db\'s chain and this one share a database without seeing each other\'s migrations', async () => {
        const database = await createTestDatabase();
        const store = await create({
            database,
            migrate: false,
            schema: { entities: STORE_ENTITIES, migrations: STORE_MIGRATIONS },
        });

        await migrateStore(store);

        const vector = await create({ database });

        expect(await vector.showMigrations()).toBe(false);
        expect(await pendingMigrations(store)).toEqual([]);
        expect(await migrationRows(store, 'migrations')).toEqual(STORE_MIGRATIONS.map((migration) => migration.name));
        expect(await migrationRows(vector, KNOWLEDGE_VECTOR_MIGRATIONS_TABLE)).toEqual(VECTOR_MIGRATION_NAMES);

        // neither schema builder proposes a change to the other's tables
        expect((await store.driver.createSchemaBuilder().log()).upQueries).toEqual([]);
        expect((await vector.driver.createSchemaBuilder().log()).upQueries).toEqual([]);
    });
});
