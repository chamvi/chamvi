/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { uuidv7 } from 'uuidv7';
import { describe, expect, it } from 'vitest';
import { MemoryConversationRepository, MemoryRegistry, MemoryRunRepository } from '@chamvi/store-memory';
import { ConversationService, DEFAULT_CONVERSATION_LIMITS } from '@chamvi/core';
import type { ResolvedConversationLimits } from '@chamvi/core';
import { makeRun } from '../../fixtures/conversation-service.ts';
import { ControllableClock } from '../../utils/clock.ts';
import {
    loadRecallGolden,
    recallProbeRunId,
    recallResultOf,
    seedRecall,
} from '../../fixtures/conversation-recall.ts';
import type { RecallResult } from '../../fixtures/conversation-recall.ts';

const golden = loadRecallGolden();

/** The seeding limits: every planned item fits one item. */
const SEED_LIMITS: ResolvedConversationLimits = { ...DEFAULT_CONVERSATION_LIMITS, maxItemBytes: 65_536 };

/** The recall of one setting over the seeded plan, by the service on fresh memory repositories. */
async function recallOnMemory(index: number): Promise<RecallResult> {
    const setting = golden.settings[index]!;
    const clock = new ControllableClock(new Date('2026-01-01T00:00:00.000Z'));
    const registry = new MemoryRegistry();
    const runs = new MemoryRunRepository({ registry });
    const store = new ConversationService({ repository: new MemoryConversationRepository({ registry }), clock });
    const seedRun = (id: string) => runs.save(runs.create(makeRun(id)));
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
            await seedRun(runId);

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

    await seedRun(recallProbeRunId(index));

    const begun = await store.beginTurn(scope, recallProbeRunId(index), 'recall', {
        ...SEED_LIMITS,
        maxItems: setting.maxItems,
        maxHistoryBytes: setting.maxHistoryBytes,
    });

    if (begun.kind !== 'ready') {
        throw new TypeError('expected ready');
    }

    return recallResultOf(begun.snapshot);
}

describe('conversation recall golden file, by the service on memory', () => {
    it('plans 300 items of mixed sizes, several above the default byte budget', () => {
        const items = golden.turns.flatMap((turn) => [turn.user[0], ...turn.replies.map(([bytes]) => bytes)]);

        expect(items).toHaveLength(300);
        expect(items.filter((bytes) => bytes > 32_768).length).toBeGreaterThan(5);
        expect(items.filter((bytes) => bytes < 1000).length).toBeGreaterThan(100);
    });

    it.each(golden.settings.map((setting, index) => [setting.name, index] as const))('recalls as recorded: %s', async (name, index) => {
        expect(await recallOnMemory(index)).toEqual(golden.expected[name]);
    });
});

describe('the recall budget', () => {
    it('keeps the snapshot within maxHistoryBytes when a stored item claims fewer bytes than its text has', async () => {
        const clock = new ControllableClock(new Date('2026-01-01T00:00:00.000Z'));
        const registry = new MemoryRegistry();
        const runs = new MemoryRunRepository({ registry });
        const repository = new MemoryConversationRepository({ registry });
        const service = new ConversationService({ repository, clock });
        const limits: ResolvedConversationLimits = { ...DEFAULT_CONVERSATION_LIMITS, maxHistoryBytes: 1000 };
        const scope = await service.resolve({
            agent: 'helper',
            channel: 'chat',
            account: 'main',
            chat: 'lying-sizes',
            audience: 'direct',
        });

        await runs.save(runs.create(makeRun('r1')));

        // stored through the repository, not the service: the stored size says 0 for 600 bytes of text
        for (const key of ['i1', 'i2']) {
            clock.advance(1);
            await repository.items.save(repository.items.create({
                id: uuidv7(),
                key,
                scopeId: scope.id,
                generation: scope.generation,
                role: 'user',
                text: key.repeat(300),
                runId: 'r1',
                createdAt: new Date(clock.now()),
                status: 'sent',
                bytes: 0,
            }));
        }

        await runs.save(runs.create(makeRun('r2')));

        const begun = await service.beginTurn(scope, 'r2', 'hello', limits);

        expect(begun.kind).toBe('ready');

        const snapshot = begun.kind === 'ready' ? begun.snapshot : undefined;
        const recalled = (snapshot?.messages ?? []).reduce((sum, message) => sum + Buffer.byteLength(String(message.content), 'utf8'), 0);

        // the stored sizes selected both; the text read back keeps the newer one only
        expect(snapshot?.itemIds).toEqual(['i2']);
        expect(snapshot?.omitted).toBe(1);
        expect(recalled).toBeLessThanOrEqual(limits.maxHistoryBytes);
    });
});
