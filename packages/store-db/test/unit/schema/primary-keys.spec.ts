/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { DataSource } from 'typeorm';
import type { TableColumn } from 'typeorm';
import { assertSchemaMatchesMetadata } from 'typeorm-extension';
import { afterEach, expect, it } from 'vitest';
import { identityId } from '@chamvi/core/conversation/persistence';
import { STORE_MIGRATIONS, createDatabaseStore, migrateStore } from '@chamvi/store-db';
import { TableName } from '../../../src/entities/constants.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';

const UUID7 = /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;
const NOW = new Date('2026-11-01T00:00:00.000Z');
const IDENTITY = {
    agent: 'legacy',
    channel: 'chat',
    account: 'personal',
    chat: 'room',
    audience: 'direct',
};
const SCOPE = identityId(IDENTITY);
const RUN = 'legacy-run';
const ARTIFACT = `${RUN}.0000`;
const LINK = {
    runId: RUN,
    scopeId: SCOPE,
    artifact: `chamvi:artifact:${ARTIFACT}`,
};
const RELEASED = STORE_MIGRATIONS.slice(0, -1);

type Snapshot = {
    table: string;
    columns: string;
    order: string;
    keys: string[];
    definitions: Array<Pick<TableColumn, 'name' | 'type' | 'length' | 'collation' | 'isNullable'>>;
    rows: unknown[];
};

function definitions(columns: TableColumn[]): Snapshot['definitions'] {
    return columns.map(({
        name,
        type,
        length,
        collation,
        isNullable,
    }) => ({
        name,
        type,
        length,
        collation,
        isNullable,
    })).sort((first, second) => first.name.localeCompare(second.name));
}

async function insert(ds: DataSource, table: string, values: Record<string, unknown>): Promise<void> {
    const columns = Object.keys(values).map((key) => `"${key}"`).join(', ');
    const parameters = Object.values(values).map((_value, index) => `$${index + 1}`).join(', ');

    await ds.query(`INSERT INTO "${table}" (${columns}) VALUES (${parameters})`, Object.values(values));
}

async function orderedPrimaryKeys(ds: DataSource): Promise<Array<{ table: string; columns: string[] }>> {
    return ds.query(`
        SELECT relation.relname AS table, array_agg(attribute.attname::text ORDER BY key.ordinality) AS columns
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinality)
        JOIN pg_attribute AS attribute ON attribute.attrelid = relation.oid AND attribute.attnum = key.attnum
        WHERE constraint_row.contype = 'p' AND namespace.nspname = current_schema()
            AND relation.relname = ANY($1)
        GROUP BY relation.relname
        ORDER BY relation.relname
    `, [Object.values(TableName)]);
}

async function snapshot(ds: DataSource): Promise<Snapshot[]> {
    const runner = ds.createQueryRunner();

    try {
        const tables = await runner.getTables(Object.values(TableName));

        expect(tables).toHaveLength(14);

        return await Promise.all(tables.map(async (table) => {
            const columns = table.columns.map((column) => `"${column.name}"`).join(', ');
            const order = table.primaryColumns.map((column) => `"${column.name}"`).join(', ');
            const rows = await ds.query(`SELECT ${columns} FROM "${table.name}" ORDER BY ${order}`);

            expect(rows.length, table.name).toBeGreaterThan(0);

            return {
                table: table.name,
                columns,
                order,
                keys: table.primaryColumns.map((column) => column.name),
                definitions: definitions(table.columns),
                rows,
            };
        }));
    } finally {
        await runner.release();
    }
}

async function expectPreserved(ds: DataSource, before: Snapshot[]): Promise<void> {
    const runner = ds.createQueryRunner();

    try {
        for (const entry of before) {
            expect(await ds.query(`SELECT ${entry.columns} FROM "${entry.table}" ORDER BY ${entry.order}`), entry.table)
                .toEqual(entry.rows);

            const table = (await runner.getTable(entry.table))!;
            const originalColumns = table.columns.filter((column) => entry.definitions.some((original) => original.name === column.name));

            expect(definitions(originalColumns), entry.table).toEqual(entry.definitions);

            const uniqueKeys = [
                table.primaryColumns.map((column) => column.name),
                ...table.indices.filter((index) => index.isUnique).map((index) => index.columnNames),
                ...table.uniques.map((unique) => unique.columnNames),
            ];

            expect(uniqueKeys.map((keys) => [...keys].sort()), entry.table).toContainEqual([...entry.keys].sort());
        }
    } finally {
        await runner.release();
    }
}

async function seedLegacy(ds: DataSource): Promise<void> {
    const early = new DataSource({ ...ds.options, migrations: RELEASED.slice(0, -2) });

    await early.initialize();

    try {
        await migrateStore(early);
        await insert(ds, TableName.RUNS, {
            id: RUN,
            agent: 'legacy',
            status: 'waiting',
            trigger: JSON.stringify({
                ...LINK,
                parent: {
                    kind: 'dispatch',
                    runId: 'missing-parent',
                    agent: 'legacy',
                    role: 'default',
                    depth: 1,
                },
            }),
            usage: JSON.stringify({ inputTokens: 1, outputTokens: 2 }),
            waiting: JSON.stringify({
                id: 'wait:legacy',
                kind: 'approval',
                artifacts: [ARTIFACT],
            }),
            created_at: NOW,
            updated_at: NOW,
        });

        for (const runId of [RUN, 'missing-run']) {
            await insert(ds, TableName.CHECKPOINTS, {
                run_id: runId,
                step_index: 1,
                messages: JSON.stringify([LINK]),
                finish_reason: 'stop',
                created_at: NOW,
            });
            await insert(ds, TableName.STEPS, {
                run_id: runId,
                step_index: 1,
                kind: 'tool',
                input: JSON.stringify(LINK),
                output: JSON.stringify(LINK),
                started_at: NOW,
                finished_at: NOW,
            });
        }
    } finally {
        await early.destroy();
    }

    const prior = new DataSource({ ...ds.options, migrations: RELEASED });

    await prior.initialize();

    try {
        await migrateStore(prior);
    } finally {
        await prior.destroy();
    }

    await insert(ds, TableName.CONVERSATIONS, {
        id: SCOPE,
        ...IDENTITY,
        generation: 3,
        active_run_id: RUN,
        snapshot_messages: JSON.stringify([LINK]),
        snapshot_item_ids: ['user:legacy-run'],
        snapshot_note_keys: ['主题😀'],
        snapshot_created_at: NOW,
        snapshot_omitted: 0,
    });
    await ds.query('UPDATE chamvi_runs SET conversation_scope_id = $1, conversation_generation = 3', [SCOPE]);
    await ds.query('UPDATE chamvi_checkpoints SET conversation_scope_id = $1, conversation_generation = 3', [SCOPE]);
    await insert(ds, TableName.CONVERSATION_ITEMS, {
        scope_id: SCOPE,
        generation: 3,
        id: 'user:legacy-run',
        run_id: RUN,
        created_at: NOW,
        role: 'assistant',
        text: 'Remember 主题😀',
        status: 'sent',
        effect_key: 'legacy:reply',
        target_channel: 'chat',
        target_address: 'room',
    });
    await insert(ds, TableName.CONVERSATION_NOTES, {
        scope_id: SCOPE,
        generation: 3,
        key: '主题😀',
        text: 'Private note',
        run_id: RUN,
        tool_call_id: 'call:legacy',
        step_index: 1,
        created_at: NOW,
        updated_at: NOW,
    });
    await insert(ds, TableName.CONVERSATION_OPERATIONS, {
        scope_id: SCOPE,
        generation: 3,
        id: 'op:legacy',
        run_id: RUN,
        input_hash: 'legacy-hash',
        kind: 'set',
        key: '主题😀',
        created_at: NOW,
    });
    await insert(ds, TableName.ARTIFACTS, {
        id: ARTIFACT,
        run_id: RUN,
        agent: 'legacy',
        media_type: 'application/octet-stream',
        filename: '证据😀.bin',
        size: 4,
        data: Buffer.from([0, 127, 128, 255]),
        created_at: NOW,
    });
    await insert(ds, TableName.AGENT_REVISIONS, {
        agent: 'legacy',
        hash: 'revision:legacy',
        changed_at: NOW,
    });
    await insert(ds, TableName.DOCS, {
        agent: 'legacy',
        collection: 'security-notes',
        id: 'review:主题😀',
        doc: JSON.stringify(LINK),
    });
    await insert(ds, TableName.KV, {
        agent: 'legacy',
        key: 'review:主题😀',
        value: JSON.stringify(LINK),
    });
    await insert(ds, TableName.EFFECTS, { key: 'legacy:reply', result: JSON.stringify(LINK) });
    await insert(ds, TableName.LOCKS, {
        key: 'legacy:lease',
        owner: 'legacy-owner',
        expires_at: NOW,
    });
    await insert(ds, TableName.IDEMPOTENCY_KEYS, {
        scope: 'legacy:chat:主题😀',
        key: 'delivery:legacy',
        run_id: RUN,
        expires_at: NOW,
    });
}

async function expectPrimaryKeys(ds: DataSource): Promise<void> {
    const runner = ds.createQueryRunner();

    try {
        const tables = await runner.getTables(Object.values(TableName));

        expect(tables).toHaveLength(16);

        for (const table of tables) {
            expect(table.primaryColumns, table.name).toHaveLength(1);

            const [primary] = table.primaryColumns;
            const bigint = table.name === TableName.STEPS || table.name === TableName.CONVERSATION_ITEMS;

            expect(primary!.type, table.name).toBe(bigint ? 'bigint' : 'uuid');

            if (!bigint) {
                const rows: { id: string }[] = await ds.query(`SELECT "${primary!.name}" AS id FROM "${table.name}"`);

                for (const row of rows) {
                    expect(row.id, table.name).toMatch(UUID7);
                }

                expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
            }
        }
    } finally {
        await runner.release();
    }

    await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();
}

describePostgres('single primary keys', () => {
    const sources: DataSource[] = [];

    afterEach(async () => {
        await Promise.all(sources.map((ds) => ds.destroy()));
        sources.length = 0;
    });

    it('creates one UUID or bigint primary key per entity on a fresh database', async () => {
        const ds = await createTestDataSource();

        sources.push(ds);

        const store = createDatabaseStore({ dataSource: ds });
        const scope = await store.conversations.resolve(IDENTITY);

        expect(scope.id).toMatch(UUID7);
        await expect(store.conversations.resolve(IDENTITY)).resolves.toEqual(scope);
        await store.connections.insert({
            name: 'test',
            type: 'whatsapp',
            keyId: 'k1',
            wrappedKey: new Uint8Array([0, 255]),
            createdAt: NOW,
            updatedAt: NOW,
        });
        await store.locks.acquire('connection:test', 'owner', 60_000);
        await store.connections.writeEntries('test', { set: { '主题😀': new Uint8Array([0, 255]) } }, { lock: 'connection:test', owner: 'owner' });

        const entryKeys = await ds.query('SELECT id FROM chamvi_connection_entries');

        await store.connections.writeEntries('test', { set: { '主题😀': new Uint8Array([1, 254]) } }, { lock: 'connection:test', owner: 'owner' });
        expect(await ds.query('SELECT id FROM chamvi_connection_entries')).toEqual(entryKeys);

        const generated: { id: string }[] = await ds.query('SELECT chamvi_uuid_v7() AS id FROM generate_series(1, 1000)');

        expect(generated.every(({ id }) => UUID7.test(id))).toBe(true);
        expect(new Set(generated.map(({ id }) => id)).size).toBe(1000);
        await expectPrimaryKeys(ds);
    });

    it('rolls back a refused downgrade when a new UUID conversation would lose its identity', async () => {
        const ds = await createTestDataSource();

        sources.push(ds);

        const store = createDatabaseStore({ dataSource: ds });
        const scope = await store.conversations.resolve(IDENTITY);
        const rows = await ds.query('SELECT * FROM chamvi_conversations');
        const migrations = await ds.query('SELECT * FROM migrations ORDER BY id');

        expect(scope.id).toMatch(UUID7);
        await expect(ds.undoLastMigration({ transaction: 'each' })).rejects.toThrow();
        expect(await ds.query('SELECT * FROM chamvi_conversations')).toEqual(rows);
        expect(await ds.query('SELECT * FROM migrations ORDER BY id')).toEqual(migrations);
        await expectPrimaryKeys(ds);
        await ds.query('DELETE FROM chamvi_conversations WHERE id = $1', [scope.id]);
        await ds.undoLastMigration({ transaction: 'each' });
        await migrateStore(ds);
        await expectPrimaryKeys(ds);
    });

    for (const table of [TableName.RUNS, TableName.IDEMPOTENCY_KEYS, TableName.ARTIFACTS]) {
        it(`refuses downgrade with a UUID7 run reference in ${table} and no conversation`, async () => {
            const ds = await createTestDataSource();

            sources.push(ds);

            const runId = '019a3f2a-1000-7000-8000-000000000001';

            if (table === TableName.RUNS) {
                await insert(ds, table, {
                    id: runId,
                    agent: 'legacy',
                    status: 'queued',
                    trigger: '{}',
                    usage: '{}',
                    created_at: NOW,
                    updated_at: NOW,
                });
            } else if (table === TableName.IDEMPOTENCY_KEYS) {
                await insert(ds, table, {
                    scope: 'legacy:chat',
                    key: 'reserved',
                    run_id: runId,
                    expires_at: NOW,
                });
            } else {
                await insert(ds, table, {
                    id: 'staged-artifact',
                    run_id: runId,
                    agent: 'legacy',
                    media_type: 'application/octet-stream',
                    size: 2,
                    data: Buffer.from([0, 255]),
                    created_at: NOW,
                });
            }

            const rows = await ds.query(`SELECT * FROM "${table}"`);
            const migrations = await ds.query('SELECT * FROM migrations ORDER BY id');

            expect(await ds.query('SELECT * FROM chamvi_conversations')).toEqual([]);
            await expect(ds.undoLastMigration({ transaction: 'each' })).rejects.toThrow();
            expect(await ds.query(`SELECT * FROM "${table}"`)).toEqual(rows);
            expect(await ds.query('SELECT * FROM migrations ORDER BY id')).toEqual(migrations);
            await expectPrimaryKeys(ds);
        });
    }

    it('rolls back a partially executed upgrade without changing released data or primary keys', async () => {
        const ds = await createTestDataSource({ migrate: false });

        sources.push(ds);
        await seedLegacy(ds);

        const before = await snapshot(ds);
        const migrations = await ds.query('SELECT * FROM migrations ORDER BY id');

        // This collision occurs after the migration has created its function, tables and UUID columns.
        await ds.query('CREATE INDEX "IDX_d355b7063fb6b3201e6d588b51" ON chamvi_agent_revisions (agent)');
        await expect(migrateStore(ds)).rejects.toMatchObject({ driverError: { code: '42P07' } });
        await expectPreserved(ds, before);
        expect(await ds.query('SELECT * FROM migrations ORDER BY id')).toEqual(migrations);
        expect(await ds.query(`SELECT to_regprocedure('chamvi_uuid_v7()') AS function,
            to_regclass('chamvi_connections') AS connections, to_regclass('chamvi_connection_entries') AS entries`))
            .toEqual([{
                function: null,
                connections: null,
                entries: null,
            }]);
        expect(await ds.query(`SELECT column_name FROM information_schema.columns
            WHERE table_schema = current_schema() AND (udt_name = 'uuid' OR column_name = 'identity_key')`)).toEqual([]);

        const runner = ds.createQueryRunner();

        try {
            for (const entry of before) {
                const table = (await runner.getTable(entry.table))!;

                expect(table.primaryColumns.map((column) => column.name).sort(), entry.table).toEqual([...entry.keys].sort());
            }
        } finally {
            await runner.release();
        }

        await ds.query('DROP INDEX "IDX_d355b7063fb6b3201e6d588b51"');
        await migrateStore(ds);
        await expectPreserved(ds, before);
        await expectPrimaryKeys(ds);
    });

    for (const schema of [undefined, 'other']) {
        it(`preserves every released table through upgrade, rollback and reapply in ${schema ?? 'public'}`, async () => {
            const ds = await createTestDataSource({ migrate: false, schema });

            sources.push(ds);

            if (schema) {
                // The helper creates the schema after connecting; refresh TypeORM's cached search schema.
                await ds.destroy();
                await ds.initialize();
            }

            await seedLegacy(ds);

            const before = await snapshot(ds);
            const primaryKeys = await orderedPrimaryKeys(ds);

            await migrateStore(ds);
            await expectPreserved(ds, before);
            await expectPrimaryKeys(ds);
            expect(await ds.query('SELECT id, identity_key FROM chamvi_conversations')).toEqual([{ id: SCOPE, identity_key: SCOPE }]);

            const unvalidated = await ds.query(`
                SELECT child.relname AS name FROM pg_constraint AS constraint_row
                JOIN pg_class AS child ON child.oid = constraint_row.conrelid
                WHERE constraint_row.contype = 'f' AND NOT constraint_row.convalidated
                AND constraint_row.confrelid = 'chamvi_runs'::regclass
                ORDER BY child.relname
            `);

            expect(unvalidated).toEqual([
                { name: TableName.CHECKPOINTS },
                { name: TableName.RUNS },
                { name: TableName.STEPS },
            ]);
            await expect(insert(ds, TableName.CHECKPOINTS, {
                run_id: 'new-missing-run',
                step_index: 1,
                messages: '[]',
                created_at: NOW,
            })).rejects.toMatchObject({ driverError: { code: '23503' } });

            const store = createDatabaseStore({ dataSource: ds });

            await expect(store.conversations!.resolve(IDENTITY)).resolves.toMatchObject({ id: SCOPE, generation: 3 });
            await expect(store.artifacts.read(ARTIFACT)).resolves.toEqual(new Uint8Array([0, 127, 128, 255]));
            await ds.undoLastMigration({ transaction: 'each' });
            await expectPreserved(ds, before);
            expect(await orderedPrimaryKeys(ds)).toEqual(primaryKeys);
            await migrateStore(ds);
            await expectPreserved(ds, before);
            await expectPrimaryKeys(ds);

            const keys = () => Promise.all([TableName.KV, TableName.DOCS, TableName.EFFECTS, TableName.AGENT_REVISIONS]
                .map((table) => ds.query(`SELECT ${table === TableName.DOCS ? 'row_id' : 'id'} AS id FROM "${table}"`)));
            const originalKeys = await keys();

            for (let index = 0; index < 2; index++) {
                await store.state.set('legacy', 'review:主题😀', LINK);
                await store.state.upsertDocument('legacy', 'security-notes', 'review:主题😀', LINK);
                await store.effects.save('legacy:reply', LINK);
                await store.agentRevisions.save({
                    agent: 'legacy',
                    hash: 'revision:legacy',
                    changedAt: NOW,
                });
            }

            expect(await keys()).toEqual(originalKeys);
            await expectPreserved(ds, before);
        });
    }
});
