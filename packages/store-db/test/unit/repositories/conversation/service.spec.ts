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
    vi,
} from 'vitest';
import { DEFAULT_CONVERSATION_LIMITS } from '@chamvi/core';
import { ControllableClock, testUuid } from '@chamvi/test-kit';
import { describeConversationServiceCases } from '../../../../../core/test/fixtures/conversation-service.ts';
import { DatabaseConversationRepository } from '../../../../src/repositories/conversation/index.ts';
import { ConversationItemEntity } from '../../../../src/entities/index.ts';
import { conversationServiceOf, seedRun } from '../../../utils/conversation.ts';
import {
    createTestDataSource,
    describePostgres,
    truncateRepository,
    untilLockWait,
} from '../../../utils/database.ts';

// Every rule of the conversation service on PostgreSQL, as on memory (core's service spec).
describePostgres('postgres conversation service', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    describeConversationServiceCases({
        name: 'postgres',
        async create(clock) {
            await truncateRepository(dataSource);

            return {
                service: conversationServiceOf(dataSource, clock),
                seedRun: (id) => seedRun(dataSource, id),
                repository: new DatabaseConversationRepository(dataSource),
                untilBlocked: () => untilLockWait(dataSource),
            };
        },
    });
});

describePostgres('postgres conversation service: batches', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    const setup = async () => {
        await truncateRepository(dataSource);

        const clock = new ControllableClock(new Date('2026-10-28T00:00:00.000Z'));
        const service = conversationServiceOf(dataSource, clock);
        const scope = await service.resolve({
            agent: 'helper',
            channel: 'chat',
            account: 'main',
            chat: 'batches',
            audience: 'direct',
        });

        return {
            clock,
            service,
            scope,
        };
    };

    const statementsOf = async (fn: () => Promise<unknown>): Promise<string[]> => {
        const queries = vi.spyOn(dataSource.logger, 'logQuery');

        try {
            await fn();

            return queries.mock.calls.map(([query]) => query);
        } finally {
            queries.mockRestore();
        }
    };

    it('a turn over 5,000 stored items keeps the newest maxStoredItems, removing the rest in pages of 100 ids', async () => {
        const {
            clock,
            service,
            scope,
        } = await setup();

        await seedRun(dataSource, testUuid('writer'));
        await seedRun(dataSource, testUuid('turn'));
        await dataSource.getRepository(ConversationItemEntity).insert(Array.from({ length: 5000 }, (_value, index) => ({
            scopeId: scope.id,
            generation: scope.generation,
            key: `item-${index}`,
            runId: testUuid('writer'),
            createdAt: new Date(clock.now()),
            role: 'user' as const,
            text: 'stored',
            bytes: 6,
            status: 'sent' as const,
        })));

        const statements = await statementsOf(() => service.beginTurn(scope, testUuid('turn'), 'now', { ...DEFAULT_CONVERSATION_LIMITS, maxStoredItems: 10 }));
        const removes = statements.filter((query) => query.startsWith('DELETE') && query.includes('chamvi_conversation_items'));

        expect(removes).toHaveLength(50);
        expect((await service.findItems(scope, { limit: 100, offset: 0 })).data.map((item) => item.id))
            .toEqual([...Array.from({ length: 9 }, (_value, index) => `item-${4991 + index}`), `user:${testUuid('turn')}`]);
    });

    it('an end of a turn with 300 pending emits settles them in one statement', async () => {
        const {
            clock,
            service,
            scope,
        } = await setup();

        await seedRun(dataSource, testUuid('run'));
        await service.beginTurn(scope, testUuid('run'), 'hello', DEFAULT_CONVERSATION_LIMITS);

        const ids: string[] = [];

        for (let index = 0; index < 300; index++) {
            const id = `emit-${index}`;

            await service.prepareEmit(scope, {
                id,
                role: 'assistant',
                text: `reply ${index}`,
                runId: testUuid('run'),
                createdAt: new Date(clock.now()),
                status: 'pending',
            });
            ids.push(id);
        }

        const statements = await statementsOf(() => service.endTurn(scope, testUuid('run'), ids.slice(0, 200)));
        const writes = statements.filter((query) => query.startsWith('INSERT') && query.includes('chamvi_conversation_items'));

        expect(writes).toHaveLength(1);

        const items = (await service.findItems(scope, { limit: 400, offset: 0 })).data;

        expect(items.filter((item) => item.status === 'sent')).toHaveLength(201);
        expect(items.filter((item) => item.status === 'unknown')).toHaveLength(100);
        expect(await service.pendingEmits(scope, testUuid('run'))).toEqual([]);
    });
});
