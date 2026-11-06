/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import { afterEach, expect, it } from 'vitest';
import { DEFAULT_CONVERSATION_LIMITS } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { SeededConversationRepository } from '../../utils/conversation.ts';
import { ConversationOperationEntity } from '../../../src/entities/index.ts';
import { createTestDataSource, describePostgres } from '../../utils/database.ts';

const RECOVERABLE_RUN = '019a3f2a-1000-7000-8000-000000000001';
const SETTLED_RUN = '019a3f2a-1000-7000-8000-000000000002';

describePostgres('conversation operation retention', () => {
    let dataSource: DataSource;

    afterEach(async () => {
        if (dataSource?.isInitialized) {
            await dataSource.destroy();
        }
    });

    it('prunes settled records beyond a full page of recoverable records', async () => {
        dataSource = await createTestDataSource();

        const clock = new ControllableClock(new Date('2026-10-28T00:00:00.000Z'));
        const store = new SeededConversationRepository({ dataSource, clock });
        const scope = await store.resolve({
            agent: 'helper',
            channel: 'chat',
            account: 'main',
            chat: 'retention',
            audience: 'direct',
        });
        const limits = { ...DEFAULT_CONVERSATION_LIMITS, retentionMs: 10_000 };

        for (const [runId, prefix, count] of [
            [RECOVERABLE_RUN, 'a', 100],
            [SETTLED_RUN, 'z', 105],
        ] as const) {
            await store.beginTurn(scope, runId, 'input', limits);

            for (let index = 0; index < count; index++) {
                const id = `${prefix}-${String(index).padStart(3, '0')}`;

                await store.applyNote(scope, {
                    id,
                    inputHash: id,
                    kind: 'remove',
                    key: 'absent',
                    source: {
                        runId,
                        toolCallId: id,
                        stepIndex: 0,
                    },
                });
            }

            await store.endTurn(scope, runId, []);
        }

        clock.advance(10_000);
        await store.prune(limits, { isSettled: async (runId) => runId === SETTLED_RUN });

        const operations = dataSource.getRepository(ConversationOperationEntity);

        expect(await operations.countBy({ scopeId: scope.id, runId: RECOVERABLE_RUN })).toBe(100);
        expect(await operations.countBy({ scopeId: scope.id, runId: SETTLED_RUN })).toBe(0);
    });
});
