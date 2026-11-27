/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { EntityConflictError } from '@chamvi/store';
import { RunStatus } from '@chamvi/core-kit';
import type { Checkpoint } from '@chamvi/core-kit';
import { MemoryCheckpointRepository, MemoryRegistry, MemoryRunRepository } from '@chamvi/store-memory';
import { 
    CheckpointService, 
    type ICheckpointService, 
    RepositoryNotFoundError, 
    RunNotFoundError, 
} from '../../../src/index.ts';

function uuid(label: string): string {
    const hex = Buffer.concat([Buffer.from(label), Buffer.alloc(16 - label.length)]).toString('hex');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function checkpointOf(runId: string, stepIndex: number, patch: Partial<Checkpoint> = {}): Checkpoint {
    return {
        runId,
        stepIndex,
        messages: [{ role: 'user', content: `step ${stepIndex}` }],
        createdAt: new Date(1_000 + stepIndex),
        ...patch,
    };
}

describe('CheckpointService', () => {
    let runs: MemoryRunRepository;
    let repository: MemoryCheckpointRepository;
    let checkpoints: ICheckpointService;

    beforeEach(async () => {
        const registry = new MemoryRegistry();

        runs = new MemoryRunRepository({ registry });
        repository = new MemoryCheckpointRepository({ registry });
        checkpoints = new CheckpointService({ repository });

        for (const id of [uuid('r1'), uuid('r2')]) {
            await runs.save(runs.create({
                id,
                agent: 'a',
                status: RunStatus.QUEUED,
                trigger: {
                    id: `t-${id}`,
                    agent: 'a',
                    trigger: 'http',
                    channel: 'http',
                    payload: {},
                    receivedAt: new Date(1_000),
                },
                usage: { inputTokens: 0, outputTokens: 0 },
                createdAt: new Date(1_000),
                updatedAt: new Date(1_000),
            }));
        }
    });

    it('keeps the highest stepIndex per run', async () => {
        await checkpoints.save(checkpointOf(uuid('r1'), 2));
        await checkpoints.save(checkpointOf(uuid('r1'), 5));
        await checkpoints.save(checkpointOf(uuid('r1'), 3));
        await checkpoints.save(checkpointOf(uuid('r2'), 9));

        expect(await checkpoints.findOne(uuid('r1'))).toStrictEqual(checkpointOf(uuid('r1'), 5));
        expect((await checkpoints.findOne(uuid('r2')))!.stepIndex).toBe(9);
    });

    it('an equal stepIndex replaces the whole checkpoint: a property it leaves out is cleared', async () => {
        await checkpoints.save(checkpointOf(uuid('r1'), 2, { finishReason: 'tool-calls' }));
        await checkpoints.save(checkpointOf(uuid('r1'), 2, { messages: [{ role: 'user', content: 'again' }] }));

        const stored = (await checkpoints.findOne(uuid('r1')))!;

        expect(stored.messages).toEqual([{ role: 'user', content: 'again' }]);
        expect(stored).not.toHaveProperty('finishReason');
    });

    it('returns from save the checkpoint the run holds, as the next read returns it, without the storage id', async () => {
        const saved = await checkpoints.save(checkpointOf(uuid('r1'), 3, { finishReason: 'stop' }));

        expect(saved).toStrictEqual(await checkpoints.findOne(uuid('r1')));
        expect(saved).not.toHaveProperty('id');
        // a lower index writes nothing and resolves the kept checkpoint
        expect(await checkpoints.save(checkpointOf(uuid('r1'), 1))).toStrictEqual(saved);
        expect(await checkpoints.findOne(uuid('r1'))).toStrictEqual(saved);
    });

    it('gives the run\'s row a uuid v7 storage id, kept by later saves', async () => {
        await checkpoints.save(checkpointOf(uuid('r1'), 1));

        const { id } = (await repository.findOneBy({ runId: uuid('r1') }))!;

        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        await checkpoints.save(checkpointOf(uuid('r1'), 2));
        expect((await repository.findOneBy({ runId: uuid('r1') }))!.id).toBe(id);
    });

    it.each([
        ['a missing run', uuid('missing')],
        ['a malformed run id', 'not-a-uuid'],
    ])('a checkpoint of %s is RunNotFoundError with today\'s message and nothing is written', async (_, runId) => {
        const error = await checkpoints.save(checkpointOf(runId, 0)).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(RunNotFoundError);
        expect(error).toMatchObject({ message: `Run "${runId}" was not found.` });
        expect(await checkpoints.findOne(runId)).toBeUndefined();
    });

    it('findOne of an unknown or malformed run is undefined; findOneOrFail throws RepositoryNotFoundError with today\'s message', async () => {
        expect(await checkpoints.findOne(uuid('r1'))).toBeUndefined();
        expect(await checkpoints.findOne('not-a-uuid')).toBeUndefined();

        for (const runId of [uuid('r1'), 'not-a-uuid']) {
            const error = await checkpoints.findOneOrFail(runId).catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(RepositoryNotFoundError);
            expect(error).toMatchObject({ code: 'repository_not_found', message: 'No matching checkpoints were found.' });
        }
    });

    it.each([
        [3, 5, 5],
        [5, 3, 5],
        [5, 5, 5],
    ])('two first checkpoints of one run with step indexes %i and %i written together both resolve and the stored index is %i', async (first, second, kept) => {
        const results = await Promise.all([
            checkpoints.save(checkpointOf(uuid('r1'), first, { finishReason: 'first' })),
            checkpoints.save(checkpointOf(uuid('r1'), second, { finishReason: 'second' })),
        ]);

        expect(results.every((result) => result.runId === uuid('r1'))).toBe(true);
        expect((await checkpoints.findOne(uuid('r1')))!.stepIndex).toBe(kept);
        expect(await repository.findManyBy({ runId: uuid('r1') })).toHaveLength(1);

        if (first === second) {
            // an equal index replaces: the later save wins
            expect((await checkpoints.findOne(uuid('r1')))!.finishReason).toBe('second');
        }
    });

    it('concurrent saves of a run that holds a checkpoint keep the highest index', async () => {
        await checkpoints.save(checkpointOf(uuid('r1'), 0));

        // a fixed shuffle of 1..20
        const order = [7, 19, 2, 13, 20, 5, 11, 1, 17, 9, 4, 15, 8, 18, 3, 12, 6, 16, 10, 14];

        await Promise.all(order.map((index) => checkpoints.save(checkpointOf(uuid('r1'), index))));

        expect(await checkpoints.findOne(uuid('r1'))).toStrictEqual(checkpointOf(uuid('r1'), 20));
    });

    it('retries a first write that lost the insert race once, in a new transaction', async () => {
        const conflicts: unknown[] = [];
        const racing = new class extends CheckpointService {
            protected override async write(checkpoint: Checkpoint): Promise<Checkpoint> {
                try {
                    return await super.write(checkpoint);
                } catch (error) {
                    conflicts.push(error);

                    throw error;
                }
            }
        }({ repository });

        await Promise.all([
            racing.save(checkpointOf(uuid('r1'), 3)),
            racing.save(checkpointOf(uuid('r1'), 5)),
        ]);

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toBeInstanceOf(EntityConflictError);
        expect((await checkpoints.findOne(uuid('r1')))!.stepIndex).toBe(5);
    });

    it('copies values in and out', async () => {
        const checkpoint = checkpointOf(uuid('r1'), 1);

        await checkpoints.save(checkpoint);
        checkpoint.messages.push({ role: 'user', content: 'later' });

        const read = (await checkpoints.findOne(uuid('r1')))!;

        expect(read.messages).toHaveLength(1);
        read.messages.push({ role: 'user', content: 'x' });
        expect((await checkpoints.findOne(uuid('r1')))!.messages).toHaveLength(1);
    });
});
