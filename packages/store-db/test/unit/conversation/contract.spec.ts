/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import {
    afterAll,
    beforeAll,
    expect,
    it,
} from 'vitest';
import { describeConversationRepositoryContract } from '@chamvi/test-kit';
import { DatabaseCheckpointRepository } from '../../../src/checkpoint/index.ts';
import { DatabaseConversationRepository } from '../../../src/conversation/index.ts';
import { TableName } from '../../../src/entities/constants.ts';
import { DatabaseRunRepository } from '../../../src/run/index.ts';
import {
    createTestDataSource,
    describePostgres,
    truncateRepository,
    untilLockWait,
} from '../../utils/database.ts';

describePostgres('postgres conversation', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeConversationRepositoryContract({
        name: 'postgres',
        async create() {
            await truncateRepository(dataSource);

            return {
                repository: new DatabaseConversationRepository(dataSource),
                runs: new DatabaseRunRepository(dataSource),
                checkpoints: new DatabaseCheckpointRepository(dataSource),
            };
        },
        untilBlocked: () => untilLockWait(dataSource),
    });
});

describePostgres('postgres conversation foreign keys', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('every foreign key of and to the conversation tables is a metadata foreign key with a label on the repositories', async () => {
        const tables = [TableName.CONVERSATIONS, TableName.CONVERSATION_ITEMS, TableName.CONVERSATION_NOTES, TableName.CONVERSATION_OPERATIONS];
        const rows: {
            conname: string;
            table: string;
            referenced: string
        }[] = await dataSource.query(
            // pg_constraint has no entity: the catalog is read to compare it with the metadata.
            `SELECT conname, conrelid::regclass::text AS table, confrelid::regclass::text AS referenced FROM pg_constraint
             WHERE contype = 'f' AND (conrelid::regclass::text = ANY($1) OR confrelid::regclass::text = ANY($1)) ORDER BY conname`,
            [tables.map((table) => `"${table}"`).concat(tables)],
        );
        const named = new Set(dataSource.entityMetadatas.flatMap((metadata) => metadata.foreignKeys.map((foreignKey) => foreignKey.name)));

        // the conversation's active run, three children with two each, runs and checkpoints to a conversation
        expect(rows).toHaveLength(9);
        expect(rows.filter((row) => !named.has(row.conname))).toEqual([]);
    });
});
