/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterEach, expect, it } from 'vitest';
import { TableName } from '../../../src/entities/constants.ts';
import {
    CheckpointEntity,
    ConnectionEntity,
    ConnectionEntryEntity,
    ConversationEntity,
    ConversationItemEntity,
    ConversationNoteEntity,
    ConversationOperationEntity,
    RunEntity,
    StepEntity,
} from '../../../src/entities/index.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';

/** Every foreign key of the schema: table, column, parent table, delete rule. */
const FOREIGN_KEYS = [
    [TableName.CHECKPOINTS, 'conversation_scope_id', TableName.CONVERSATIONS, 'NO ACTION'],
    [TableName.CHECKPOINTS, 'run_id', TableName.RUNS, 'NO ACTION'],
    [TableName.CONNECTION_ENTRIES, 'connection_id', TableName.CONNECTIONS, 'CASCADE'],
    [TableName.CONVERSATION_ITEMS, 'run_id', TableName.RUNS, 'NO ACTION'],
    [TableName.CONVERSATION_ITEMS, 'scope_id', TableName.CONVERSATIONS, 'NO ACTION'],
    [TableName.CONVERSATION_NOTES, 'run_id', TableName.RUNS, 'NO ACTION'],
    [TableName.CONVERSATION_NOTES, 'scope_id', TableName.CONVERSATIONS, 'NO ACTION'],
    [TableName.CONVERSATION_OPERATIONS, 'run_id', TableName.RUNS, 'NO ACTION'],
    [TableName.CONVERSATION_OPERATIONS, 'scope_id', TableName.CONVERSATIONS, 'NO ACTION'],
    [TableName.CONVERSATIONS, 'active_run_id', TableName.RUNS, 'NO ACTION'],
    [TableName.RUNS, 'conversation_scope_id', TableName.CONVERSATIONS, 'NO ACTION'],
    [TableName.RUNS, 'parent_run_id', TableName.RUNS, 'NO ACTION'],
    [TableName.STEPS, 'run_id', TableName.RUNS, 'NO ACTION'],
];

type Seeded = {
    runId: string;
    scopeId: string;
    connectionId: string;
};

/** One row on each side of every foreign key, written through the entities. */
async function seed(ds: DataSource): Promise<Seeded> {
    const now = new Date('2026-10-28T00:00:00.000Z');
    const runId = randomUUID();
    const childId = randomUUID();
    const scopeId = randomUUID();
    const connectionId = randomUUID();
    const run = (id: string) => ({
        id,
        agent: 'helper',
        status: 'running' as const,
        trigger: { id },
        usage: { inputTokens: 0, outputTokens: 0 },
        conversationScopeId: scopeId,
        createdAt: now,
        updatedAt: now,
    });

    await ds.getRepository(ConversationEntity).insert({
        id: scopeId,
        identityKey: 'a'.repeat(64),
        agent: 'helper',
        channel: 'chat',
        account: 'main',
        chat: 'relations',
        audience: 'direct',
        generation: 0,
    });
    await ds.getRepository(RunEntity).insert(run(runId));
    await ds.getRepository(RunEntity).insert({ ...run(childId), parentRunId: runId });
    await ds.getRepository(ConversationEntity).update({ id: scopeId }, { activeRunId: runId });
    await ds.getRepository(CheckpointEntity).insert({
        id: randomUUID(),
        runId,
        conversationScopeId: scopeId,
        conversationGeneration: 0,
        stepIndex: 0,
        messages: [],
        createdAt: now,
    });
    await ds.getRepository(StepEntity).insert({
        runId,
        index: 0,
        kind: 'llm',
        startedAt: now,
        finishedAt: now,
    });
    await ds.getRepository(ConversationItemEntity).insert({
        scopeId,
        generation: 0,
        itemId: 'item',
        runId,
        createdAt: now,
        role: 'user',
        text: 'input',
        status: 'pending',
    });
    await ds.getRepository(ConversationNoteEntity).insert({
        id: randomUUID(),
        scopeId,
        generation: 0,
        key: 'key',
        text: 'note',
        runId,
        toolCallId: 'call',
        stepIndex: 0,
        createdAt: now,
        updatedAt: now,
    });
    await ds.getRepository(ConversationOperationEntity).insert({
        id: randomUUID(),
        scopeId,
        generation: 0,
        operationId: 'op',
        runId,
        inputHash: 'hash',
        kind: 'set',
        key: 'key',
        createdAt: now,
    });
    await ds.getRepository(ConnectionEntity).insert({
        id: connectionId,
        name: 'main',
        type: 'test',
        keyId: 'key',
        wrappedKey: Buffer.from([1]),
        createdAt: now,
        updatedAt: now,
    });
    await ds.getRepository(ConnectionEntryEntity).insert({
        id: randomUUID(),
        connectionId,
        key: 'a',
        value: Buffer.from([1]),
    });

    return {
        runId, 
        scopeId, 
        connectionId, 
    };
}

describePostgres('relational integrity', () => {
    let ds: DataSource;

    afterEach(async () => {
        if (ds?.isInitialized) {
            await ds.destroy();
        }
    });

    it('every declared foreign key rejects a missing parent', async () => {
        ds = await createTestDataSource();
        await seed(ds);

        const runner = ds.createQueryRunner();

        try {
            const tables = await runner.getTables(Object.values(TableName));
            const declared = tables.flatMap((table) => table.foreignKeys.map((key) => {
                expect(key.referencedColumnNames).toEqual(['id']);
                expect(key.columnNames).toHaveLength(1);

                return [table.name, key.columnNames[0], key.referencedTableName, key.onDelete];
            }));
            const order = (entry: (string | undefined)[]) => entry.join(' ');

            expect(declared.toSorted((a, b) => order(a).localeCompare(order(b))))
                .toEqual(FOREIGN_KEYS.toSorted((a, b) => order(a).localeCompare(order(b))));
        } finally {
            await runner.release();
        }

        for (const [table, column] of FOREIGN_KEYS) {
            await expect(
                ds.query(`UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" IS NOT NULL`, [randomUUID()]),
                `${table}.${column}`,
            ).rejects.toMatchObject({ driverError: { code: '23503' } });
        }
    });

    it('keeps referenced parents and removes entries with their connection', async () => {
        ds = await createTestDataSource();

        const {
            runId, 
            scopeId, 
            connectionId, 
        } = await seed(ds);

        await expect(ds.query(`DELETE FROM "${TableName.RUNS}" WHERE id = $1`, [runId]))
            .rejects.toMatchObject({ driverError: { code: '23503' } });
        await expect(ds.query(`DELETE FROM "${TableName.CONVERSATIONS}" WHERE id = $1`, [scopeId]))
            .rejects.toMatchObject({ driverError: { code: '23503' } });

        await ds.getRepository(ConnectionEntity).delete({ id: connectionId });
        expect(await ds.getRepository(ConnectionEntryEntity).countBy({ connectionId })).toBe(0);
    });

    it('loads related rows through normal TypeORM relations', async () => {
        ds = await createTestDataSource();
        await seed(ds);

        const parents: [RegExp, string][] = [
            [/runId$/i, TableName.RUNS],
            [/scopeId$/i, TableName.CONVERSATIONS],
            [/connectionId$/i, TableName.CONNECTIONS],
        ];
        // These IDs reserve runs before runs.insert; every other local reference must be queryable.
        const reservations = new Set([`${TableName.ARTIFACTS}.runId`, `${TableName.IDEMPOTENCY_KEYS}.runId`]);

        for (const metadata of ds.entityMetadatas) {
            for (const column of metadata.columns) {
                const parent = parents.find(([pattern]) => pattern.test(column.propertyName))?.[1];

                if (!parent || reservations.has(`${metadata.tableName}.${column.propertyName}`)) {
                    continue;
                }

                const relation = metadata.relations.find((entry) => entry.joinColumns.includes(column));

                expect(relation, `${metadata.name}.${column.propertyName} needs an owning TypeORM relation`).toBeDefined();

                if (!relation) {
                    continue;
                }

                expect(relation.inverseEntityMetadata.tableName).toBe(parent);

                const entity = await ds.getRepository(metadata.target).createQueryBuilder('entity')
                    .leftJoinAndSelect(`entity.${relation.propertyName}`, 'parent')
                    .where(`entity.${column.propertyName} IS NOT NULL`)
                    .getOne();

                expect(entity, `${metadata.name}.${column.propertyName} has a seeded row`).toBeDefined();
                expect(entity?.[relation.propertyName]).toMatchObject({ id: entity?.[column.propertyName] });
            }
        }
    });
});
