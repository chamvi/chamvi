/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Table } from 'typeorm';
import type { DataSource } from 'typeorm';
import { assertSchemaMatchesMetadata } from 'typeorm-extension';
import { uuidv7 } from 'uuidv7';
import {
    afterEach,
    expect,
    it,
} from 'vitest';
import { testUuid } from '@chamvi/test-kit';
import { TableName } from '../../../src/entities/constants.ts';
import { DatabaseConversationItemRepository } from '../../../src/repositories/conversation/index.ts';
import { STORE_MIGRATIONS, migrateStore, pendingMigrations } from '../../../src/schema/index.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';
import type { TestDataSourceOptions } from '../../utils/database.ts';
import { createTestServices } from '../../utils/store.ts';

const UUID_IDS = 'UuidIds1795856376161';

/** The released chain: every migration up to the latest one tag v0.12.0 contains. */
const RELEASED = 'LimitUses1795552285096';

/** A uuid v7: version nibble 7, RFC 4122 variant. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const TABLES = [TableName.STEPS, TableName.CONVERSATION_ITEMS, TableName.LOCK_TOKENS];

const IDENTITY = {
    agent: 'helper',
    channel: 'chat',
    account: 'main',
    chat: 'room',
    audience: 'direct' as const,
};

type StepRow = {
    id: string,
    run_id: string,
    step_index: number,
    kind: string,
    name: string
};
type ItemRow = {
    id: string,
    scope_id: string,
    key: string,
    text: string,
    bytes: number
};
type TokenRow = { id: number, value: string };

describePostgres('uuid ids migration', () => {
    const dataSources: DataSource[] = [];
    const runId = testUuid('run');
    const scopeId = testUuid('scope');

    const create = async (opts?: TestDataSourceOptions) => {
        const dataSource = await createTestDataSource(opts);

        dataSources.push(dataSource);

        return dataSource;
    };

    /** The tables, columns, keys and indexes of the migrated tables, comparable across databases. */
    const describeTables = async (ds: DataSource) => {
        const runner = ds.createQueryRunner();

        try {
            const tables = await runner.getTables(TABLES);

            return tables
                .map((table: Table) => ({
                    name: table.name,
                    columns: table.columns.map((column) => ({
                        name: column.name,
                        type: column.type,
                        length: column.length,
                        nullable: column.isNullable,
                        primary: column.isPrimary,
                        generated: column.isGenerated ? column.generationStrategy : undefined,
                        default: column.default,
                        collation: column.collation,
                    })).sort((a, b) => a.name.localeCompare(b.name)),
                    indices: table.indices
                        .map((index) => ({
                            name: index.name,
                            columns: index.columnNames,
                            unique: index.isUnique,
                        }))
                        .sort((a, b) => a.name!.localeCompare(b.name!)),
                    foreignKeys: table.foreignKeys
                        .map((key) => ({
                            name: key.name,
                            columns: key.columnNames,
                            table: key.referencedTableName,
                            onDelete: key.onDelete,
                        }))
                        .sort((a, b) => a.name!.localeCompare(b.name!)),
                    uniques: table.uniques.map((unique) => unique.columnNames),
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } finally {
            await runner.release();
        }
    };

    /**
     * A database on the released chain only, built by the released
     * migrations' own `up()`s and recorded in the migrations table, so the
     * start never depends on the migration under test.
     */
    const releasedDatabase = async () => {
        const ds = await create({ migrate: false });
        const runner = ds.createQueryRunner();
        const released = STORE_MIGRATIONS.slice(0, STORE_MIGRATIONS.findIndex((migration) => migration.name === RELEASED) + 1);

        try {
            for (const Migration of released) {
                await new Migration().up(runner);
            }

            // the table TypeORM's migration executor creates, with a row per applied migration
            await runner.createTable(new Table({
                name: 'migrations',
                columns: [
                    {
                        name: 'id',
                        type: 'integer',
                        isGenerated: true,
                        generationStrategy: 'increment',
                        isPrimary: true,
                    },
                    { name: 'timestamp', type: 'bigint' },
                    { name: 'name', type: 'varchar' },
                ],
            }));

            for (const Migration of released) {
                const { name } = new Migration();

                await runner.query('INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)', [name!.slice(-13), name]);
            }
        } finally {
            await runner.release();
        }

        expect(await pendingMigrations(ds)).toEqual([UUID_IDS]);

        return ds;
    };

    /** The schema `down()` must restore: the released `up()`s alone. */
    const releasedSchema = async () => describeTables(await releasedDatabase());

    /** The millisecond timestamp a uuid v7 carries in its first 48 bits. */
    const uuidTime = (id: string) => Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);

    const toReleased = async (ds: DataSource) => {
        await ds.undoLastMigration({ transaction: 'each' });
        expect(await pendingMigrations(ds)).toEqual([UUID_IDS]);
    };

    const stepRows = async (ds: DataSource, order: string, id = 'id'): Promise<StepRow[]> => ds.query(
        `SELECT ${id}, run_id, step_index, kind, name FROM "${TableName.STEPS}" ORDER BY ${order}`,
    );

    const itemRows = async (ds: DataSource, order: string, id = 'id'): Promise<ItemRow[]> => ds.query(
        `SELECT ${id}, scope_id, key, text, bytes FROM "${TableName.CONVERSATION_ITEMS}" ORDER BY ${order}`,
    );

    /** A run, a conversation, and their steps and items in a known order, on the released schema. */
    const seed = async (ds: DataSource) => {
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

        // two steps of index 1 and a late one of index 0: the read order is (index, insert order)
        for (const [index, kind, name] of [[0, 'llm', 'a'], [1, 'tool', 'b'], [1, 'tool', 'c'], [0, 'llm', 'd']] as const) {
            await ds.query(
                `INSERT INTO "${TableName.STEPS}" (run_id, step_index, kind, name, started_at, finished_at)
                 VALUES ($1, $2, $3, $4, now(), now())`,
                [runId, index, kind, name],
            );
        }

        // one creation time for all: only the insert order tells them apart
        for (const key of ['user:z', 'assistant:a:0', 'user:m']) {
            await ds.query(
                `INSERT INTO "${TableName.CONVERSATION_ITEMS}"
                 (scope_id, generation, key, run_id, created_at, role, text, bytes, status)
                 VALUES ($1, 0, $2, $3, '2026-01-01T00:00:00Z', 'user', $2, octet_length($2), 'sent')`,
                [scopeId, key, runId],
            );
        }
    };

    afterEach(async () => {
        await Promise.all(dataSources.map((ds) => ds.destroy()));
        dataSources.length = 0;
    });

    it('is the one migration after the released chain', () => {
        const names = STORE_MIGRATIONS.map((migration) => migration.name);

        expect(names.slice(names.indexOf(RELEASED) + 1)).toEqual([UUID_IDS]);
    });

    it('moves stored steps, items and the lock token to uuid ids with every row, foreign key and read order, and reverts', async () => {
        const ds = await releasedDatabase();

        await seed(ds);

        const steps = await stepRows(ds, 'id');
        const items = await itemRows(ds, 'id');
        const [token]: TokenRow[] = await ds.query(`SELECT id, value FROM "${TableName.LOCK_TOKENS}"`);

        expect(steps.map((row) => row.name)).toEqual(['a', 'b', 'c', 'd']);
        expect(token!.id).toBe(1);

        await migrateStore(ds);
        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();

        // every row, its old bigint id as its sequence, under a distinct uuid
        expect(await stepRows(ds, 'sequence', 'sequence AS id')).toEqual(steps);
        expect(await itemRows(ds, 'sequence', 'sequence AS id')).toEqual(items);

        const stepIds = (await stepRows(ds, 'sequence')).map((row) => row.id);
        const itemIds = (await itemRows(ds, 'sequence')).map((row) => row.id);

        expect(stepIds.every((id) => UUID.test(id))).toBe(true);
        expect(new Set(stepIds).size).toBe(steps.length);
        expect(itemIds.every((id) => UUID.test(id))).toBe(true);
        expect(new Set(itemIds).size).toBe(items.length);

        // each backfilled uuid carries its row's time
        const timed: { id: string, at: Date }[] = [
            ...await ds.query(`SELECT id, started_at AS at FROM "${TableName.STEPS}"`),
            ...await ds.query(`SELECT id, created_at AS at FROM "${TableName.CONVERSATION_ITEMS}"`),
        ];

        expect(timed).toHaveLength(steps.length + items.length);

        for (const row of timed) {
            expect(uuidTime(row.id), row.id).toBe(row.at.getTime());
        }

        const migratedToken: {
            id: string,
            key: string,
            value: string
        }[] = await ds.query(
            `SELECT id, key, value FROM "${TableName.LOCK_TOKENS}"`,
        );

        expect(migratedToken).toEqual([{
            id: expect.stringMatching(UUID),
            key: 'lock',
            value: token!.value,
        }]);

        // reads keep their order, and new rows follow the stored ones
        const store = createTestServices({ dataSource: ds });
        const scope = {
            id: scopeId,
            generation: 0,
            identity: IDENTITY,
        };

        expect((await store.stepService.find(runId)).map((step) => step.name)).toEqual(['a', 'd', 'b', 'c']);
        expect((await store.conversationService.findItems(scope, { limit: 10, offset: 0 })).data.map((item) => item.id))
            .toEqual(['user:z', 'assistant:a:0', 'user:m']);

        await store.stepService.create({
            runId,
            index: 1,
            kind: 'tool',
            name: 'e',
            startedAt: new Date(),
            finishedAt: new Date(),
        });
        expect((await store.stepService.find(runId)).map((step) => step.name)).toEqual(['a', 'd', 'b', 'c', 'e']);

        const repository = new DatabaseConversationItemRepository(ds);
        const replaced = await repository.upsert({
            id: uuidv7(),
            sequence: 0,
            scopeId,
            generation: 0,
            key: 'user:z',
            runId,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            role: 'user',
            text: 'replaced',
            bytes: 8,
            status: 'sent',
        });
        const added = await repository.upsert({
            id: uuidv7(),
            sequence: 0,
            scopeId,
            generation: 0,
            key: 'user:new',
            runId,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            role: 'user',
            text: 'new',
            bytes: 3,
            status: 'sent',
        });

        // a created item's given sequence is ignored too: the insert takes the next one and returns it
        const saved = await repository.save(repository.create({
            id: uuidv7(),
            sequence: 1,
            scopeId,
            generation: 0,
            key: 'user:saved',
            runId,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            role: 'user',
            text: 'saved',
            bytes: 5,
            status: 'sent',
        }));

        expect(saved.sequence).toBeGreaterThan(added.sequence);
        expect((await repository.findOneById(saved.id))?.sequence).toBe(saved.sequence);
        await repository.remove(saved);

        expect(replaced.id).toBe(itemIds[0]);
        expect(replaced.sequence).toBe(Number(items[0]!.id));
        expect(added.sequence).toBeGreaterThan(Number(items.at(-1)!.id));
        expect((await store.conversationService.findItems(scope, { limit: 10, offset: 0 })).data.map((item) => item.id))
            .toEqual(['user:z', 'assistant:a:0', 'user:m', 'user:new']);

        // the foreign keys hold
        await expect(ds.query(
            `INSERT INTO "${TableName.STEPS}" (id, run_id, step_index, kind, started_at, finished_at)
             VALUES ($1, $2, 0, 'llm', now(), now())`,
            [uuidv7(), testUuid('missing')],
        )).rejects.toMatchObject({ code: '23503' });
        await expect(ds.query(
            `INSERT INTO "${TableName.CONVERSATION_ITEMS}" (id, scope_id, generation, key, run_id, created_at, role, text, bytes, status)
             VALUES ($1, $2, 0, 'k', $3, now(), 'user', 'x', 1, 'sent')`,
            [uuidv7(), testUuid('missing'), runId],
        )).rejects.toMatchObject({ code: '23503' });

        // a token issued after the migration is above the stored one
        expect(await store.lockService.acquire('a', 'o', 60_000)).toBeGreaterThan(Number(token!.value));

        // each row with its sequence where the reverted schema keeps its bigint id
        const before = {
            steps: await stepRows(ds, 'sequence', 'sequence AS id'),
            items: await itemRows(ds, 'sequence', 'sequence AS id'),
            token: (await ds.query(`SELECT value FROM "${TableName.LOCK_TOKENS}"`))[0].value as string,
        };

        // down: the released schema with the same rows, each sequence back as its bigint id
        await toReleased(ds);
        expect(await describeTables(ds)).toEqual(await releasedSchema());
        expect(await stepRows(ds, 'id')).toEqual(before.steps);
        expect(await itemRows(ds, 'id')).toEqual(before.items);
        expect(await ds.query(`SELECT id, value FROM "${TableName.LOCK_TOKENS}"`)).toEqual([{ id: 1, value: before.token }]);

        // the reverted counters continue above the stored ids
        const [inserted]: { id: string }[] = await ds.query(
            `INSERT INTO "${TableName.STEPS}" (run_id, step_index, kind, name, started_at, finished_at)
             VALUES ($1, 2, 'llm', 'f', now(), now()) RETURNING id`,
            [runId],
        );

        expect(Number(inserted!.id)).toBeGreaterThan(Number(before.steps.at(-1)!.id));

        // up again
        await migrateStore(ds);
        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();
        expect((await store.stepService.find(runId)).map((step) => step.name)).toEqual(['a', 'd', 'b', 'c', 'e', 'f']);
        expect((await store.conversationService.findItems(scope, { limit: 10, offset: 0 })).data.map((item) => item.id))
            .toEqual(['user:z', 'assistant:a:0', 'user:m', 'user:new']);
        expect(await store.lockService.acquire('b', 'o', 60_000)).toBeGreaterThan(Number(before.token));
    });

    it('migrates an empty lock token table both ways, and the next token reseeds the counter row', async () => {
        const ds = await releasedDatabase();

        await ds.query(`TRUNCATE "${TableName.LOCK_TOKENS}"`);
        await migrateStore(ds);
        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();
        expect(await ds.query(`SELECT id FROM "${TableName.LOCK_TOKENS}"`)).toEqual([]);

        const store = createTestServices({ dataSource: ds });
        const floor = Date.now() * 1000;
        const first = (await store.lockService.acquire('a', 'o', 60_000))!;
        const seeded: {
            id: string,
            key: string,
            value: string
        }[] = await ds.query(
            `SELECT id, key, value FROM "${TableName.LOCK_TOKENS}"`,
        );

        expect(first).toBeGreaterThanOrEqual(floor);
        expect(seeded).toEqual([{
            id: expect.stringMatching(UUID),
            key: 'lock',
            value: String(first),
        }]);

        // down and up again on an empty table: the next token reseeds above the stored lease
        await ds.query(`TRUNCATE "${TableName.LOCK_TOKENS}"`);
        await toReleased(ds);
        expect(await ds.query(`SELECT id FROM "${TableName.LOCK_TOKENS}"`)).toEqual([]);
        await migrateStore(ds);
        await expect(assertSchemaMatchesMetadata(ds)).resolves.toBeUndefined();

        // park the surviving lease's token far above any clock floor (about 11 days of microseconds)
        const surviving = first + 1e12;

        await ds.query(`UPDATE "${TableName.LOCKS}" SET token = $1`, [surviving]);

        const second = (await store.lockService.acquire('b', 'o', 60_000))!;
        const reseeded: {
            id: string,
            key: string,
            value: string
        }[] = await ds.query(
            `SELECT id, key, value FROM "${TableName.LOCK_TOKENS}"`,
        );

        // the surviving lease decides: a clock-only reseed would issue about Date.now() * 1000, far below it
        expect(second).toBe(surviving + 1);
        expect(reseeded).toEqual([{
            id: expect.stringMatching(UUID),
            key: 'lock',
            value: String(second),
        }]);
        expect(reseeded[0]!.id).not.toBe(seeded[0]!.id);
    });
});
