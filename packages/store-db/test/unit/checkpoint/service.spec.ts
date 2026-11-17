/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, EntityManager } from 'typeorm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    it,
} from 'vitest';
import {
    CheckpointService,
    ConversationService,
    RunNotFoundError,
    systemClock,
} from '@chamvi/core';
import { EntityConflictError, EntityRelationError } from '@chamvi/store';
import type { Checkpoint, CheckpointRecord } from '@chamvi/store';
import { testUuid } from '@chamvi/test-kit';
import { DatabaseCheckpointRepository } from '../../../src/checkpoint/index.ts';
import { DatabaseConversationRepository } from '../../../src/conversation/index.ts';
import { createBarrier } from '../../utils/barrier.ts';
import type { Barrier } from '../../utils/barrier.ts';
import { seedRun } from '../../utils/conversation.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../utils/database.ts';

/**
 * Holds each transaction's single-row read at a barrier, so two first
 * checkpoints both read before either writes; records the storage errors
 * its saves report.
 */
class BarrierCheckpointRepository extends DatabaseCheckpointRepository {
    protected barrier: Barrier;

    readonly failures: unknown[];

    constructor(source: DataSource | EntityManager, barrier: Barrier, failures: unknown[] = []) {
        super(source);
        this.barrier = barrier;
        this.failures = failures;
    }

    override withManager(manager: EntityManager): this {
        return new BarrierCheckpointRepository(manager, this.barrier, this.failures) as this;
    }

    override async save(entity: CheckpointRecord): Promise<CheckpointRecord> {
        try {
            return await super.save(entity);
        } catch (error) {
            this.failures.push(error);

            throw error;
        }
    }

    override async findOneBy(where: Partial<CheckpointRecord>): Promise<CheckpointRecord | null> {
        const found = await super.findOneBy(where);

        if (this.tx) {
            await this.barrier.arrive();
        }

        return found;
    }
}

function checkpointOf(stepIndex: number, patch: Partial<Checkpoint> = {}): Checkpoint {
    return {
        runId: testUuid('r1'),
        stepIndex,
        messages: [{ role: 'user', content: `step ${stepIndex}` }],
        createdAt: new Date(1_000 + stepIndex),
        ...patch,
    };
}

describePostgres('CheckpointService on PostgreSQL', () => {
    let dataSource: DataSource;
    let checkpoints: CheckpointService;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    beforeEach(async () => {
        await truncateRepository(dataSource);
        await seedRun(dataSource, testUuid('r1'));
        checkpoints = new CheckpointService({ repository: new DatabaseCheckpointRepository(dataSource) });
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it.each([
        [3, 5, 5],
        [5, 3, 5],
        [5, 5, 5],
    ])('two first checkpoints of one run with step indexes %i and %i written together both resolve and the stored index is %i', async (first, second, kept) => {
        const racing = new CheckpointService({ repository: new BarrierCheckpointRepository(dataSource, createBarrier(2)) });

        await Promise.all([
            racing.save(checkpointOf(first, { finishReason: 'first' })),
            racing.save(checkpointOf(second, { finishReason: 'second' })),
        ]);

        expect((await checkpoints.findOne(testUuid('r1')))!.stepIndex).toBe(kept);

        const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM chamvi_checkpoints WHERE run_id = $1', [testUuid('r1')]);

        expect(count).toBe(1);
    });

    it('concurrent saves of a run that holds a checkpoint keep the highest index', async () => {
        await checkpoints.save(checkpointOf(0));

        // a fixed shuffle of 1..20
        const order = [7, 19, 2, 13, 20, 5, 11, 1, 17, 9, 4, 15, 8, 18, 3, 12, 6, 16, 10, 14];

        await Promise.all(order.map((index) => checkpoints.save(checkpointOf(index))));

        expect(await checkpoints.findOne(testUuid('r1'))).toStrictEqual(checkpointOf(20));
    });

    it('retries a first write that lost the insert race once, in a new transaction', async () => {
        const repository = new BarrierCheckpointRepository(dataSource, createBarrier(2));
        const racing = new CheckpointService({ repository });

        await Promise.all([racing.save(checkpointOf(3)), racing.save(checkpointOf(5))]);

        // both first writes read no row, so both insert: the loser's conflict is retried and finds the row
        expect(repository.failures).toHaveLength(1);
        expect(repository.failures[0]).toBeInstanceOf(EntityConflictError);
        expect((await checkpoints.findOne(testUuid('r1')))!.stepIndex).toBe(5);
    });

    it('returns from save what the next read returns, a conversation provenance included', async () => {
        const conversations = new ConversationService({ repository: new DatabaseConversationRepository(dataSource), clock: systemClock });
        const scope = await conversations.resolve({
            agent: 'a',
            channel: 'chat',
            account: 'main',
            chat: 'room',
            audience: 'direct',
        });
        const saved = await checkpoints.save(checkpointOf(2, {
            finishReason: 'stop',
            conversation: { scopeId: scope.id, generation: scope.generation },
        }));

        expect(saved).toStrictEqual(await checkpoints.findOne(testUuid('r1')));
        expect(saved.conversation).toEqual({ scopeId: scope.id, generation: scope.generation });
        expect(await checkpoints.save(checkpointOf(2))).toStrictEqual(await checkpoints.findOne(testUuid('r1')));
        expect(await checkpoints.findOne(testUuid('r1'))).not.toHaveProperty('conversation');
    });

    it.each([
        ['a missing run', testUuid('missing')],
        ['a malformed run id', 'not-a-uuid'],
    ])('a checkpoint of %s is RunNotFoundError and nothing is written', async (_, runId) => {
        await expect(checkpoints.save(checkpointOf(0, { runId }))).rejects.toBeInstanceOf(RunNotFoundError);
        expect(await checkpoints.findOne(runId)).toBeUndefined();
    });

    it('a checkpoint naming a missing conversation scope is EntityRelationError naming the conversation', async () => {
        const repository = new DatabaseCheckpointRepository(dataSource);
        const error = await repository.save(repository.create({
            ...checkpointOf(1),
            id: testUuid('c1'),
            conversation: { scopeId: testUuid('missing'), generation: 1 },
        })).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(EntityRelationError);
        expect(error).toMatchObject({ entity: 'checkpoint', relation: 'conversation' });
    });
});
