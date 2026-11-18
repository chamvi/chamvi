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
import { DEFAULT_CONVERSATION_LIMITS } from '@chamvi/core';
import type { ResolvedConversationLimits } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import {
    loadRecallGolden,
    recallProbeRunId,
    recallResultOf,
    seedRecall,
} from '../../../../../core/test/fixtures/conversation-recall.ts';
import { conversationServiceOf, seedRun } from '../../../utils/conversation.ts';
import { createTestDataSource, describePostgres } from '../../../utils/database.ts';

const golden = loadRecallGolden();

const SEED_LIMITS: ResolvedConversationLimits = { ...DEFAULT_CONVERSATION_LIMITS, maxItemBytes: 65_536 };

// The service's recall over PostgreSQL equals the golden file recorded from the stores before it.
describePostgres('conversation recall golden file, by the service on PostgreSQL', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it.each(golden.settings.map((setting, index) => [setting.name, index] as const))('recalls as recorded: %s', async (name, index) => {
        const setting = golden.settings[index]!;
        const clock = new ControllableClock(new Date('2026-01-01T00:00:00.000Z'));
        const store = conversationServiceOf(dataSource, clock);
        const scope = await store.resolve({
            agent: 'helper',
            channel: 'chat',
            account: 'main',
            chat: `recall-${setting.name}`,
            audience: 'direct',
        });

        await seedRecall(golden, {
            begin: async (runId, text) => {
                clock.advance(1);
                await seedRun(dataSource, runId);

                const begun = await store.beginTurn(scope, runId, text, SEED_LIMITS);

                expect(begun.kind).toBe('ready');
            },
            emit: async (runId, id, text) => {
                await store.prepareEmit(scope, {
                    id,
                    role: 'assistant',
                    text,
                    runId,
                    createdAt: new Date(clock.now()),
                    status: 'pending',
                    effectKey: `${id}:effect`,
                    target: { channel: 'chat', address: 'room' },
                });
            },
            end: async (runId, confirmed) => {
                await store.endTurn(scope, runId, confirmed);
            },
        });

        await seedRun(dataSource, recallProbeRunId(index));

        const begun = await store.beginTurn(scope, recallProbeRunId(index), 'recall', {
            ...SEED_LIMITS,
            maxItems: setting.maxItems,
            maxHistoryBytes: setting.maxHistoryBytes,
        });

        if (begun.kind !== 'ready') {
            throw new TypeError('expected ready');
        }

        expect(recallResultOf(begun.snapshot)).toEqual(golden.expected[name]);
    }, 120_000);
});
