/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityConflictError, EntityRelationError } from '@chamvi/errors';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import type { ICheckpointRepository, IRunRepository } from '@chamvi/store';
import type { CheckpointRecord } from '@chamvi/core-kit';
import { makeRun, testUuid } from '../fixture/helpers.ts';
import type { CheckpointRepositoryContractInput } from './types.ts';

function checkpointOf(id: string, runId: string, patch: Partial<CheckpointRecord> = {}): CheckpointRecord {
    return {
        id,
        runId,
        stepIndex: 1,
        messages: [{ role: 'user', content: 'hi' }],
        createdAt: new Date(1_000),
        ...patch,
    };
}

/**
 * The storage behaviour of an `ICheckpointRepository`: one row per run
 * stored as given, the run reference, the unique run, changed-column
 * saves, copies, and transactions on one row applied one after the other.
 */
export function describeCheckpointRepositoryContract(input: CheckpointRepositoryContractInput): void {
    describe(`checkpoint repository contract: ${input.name}`, () => {
        let runs: IRunRepository;
        let checkpoints: ICheckpointRepository;

        beforeEach(async () => {
            ({ runs, checkpoints } = await input.create());
            await runs.save(runs.create(makeRun(testUuid('r1'))));
            await runs.save(runs.create(makeRun(testUuid('r2'))));
        });

        it('stores every field, reads absent ones as absent and resolves from save what the next read returns', async () => {
            const full = checkpointOf(testUuid('c1'), testUuid('r1'), {
                stepIndex: 3,
                messages: [
                    { role: 'user', content: 'hi' },
                    {
                        role: 'assistant',
                        content: [{
                            type: 'tool-call',
                            toolCallId: 'call-1',
                            toolName: 'lookup',
                            input: { q: 'x' },
                        }],
                    },
                ],
                finishReason: 'tool-calls',
            });
            const saved = await checkpoints.save(checkpoints.create(full));
            const read = await checkpoints.findOneBy({ runId: testUuid('r1') });

            expect(read).toEqual(full);
            expect(saved).toStrictEqual(read);
            expect(read!.createdAt).toBeInstanceOf(Date);

            await checkpoints.save(checkpoints.create(checkpointOf(testUuid('c2'), testUuid('r2'))));

            const plain = (await checkpoints.findOneById(testUuid('c2')))!;

            expect(plain).not.toHaveProperty('finishReason');
            expect(plain).not.toHaveProperty('conversation');
        });

        it('reads an unknown or malformed run or id as null', async () => {
            expect(await checkpoints.findOneBy({ runId: testUuid('r1') })).toBeNull();
            expect(await checkpoints.findOneBy({ runId: 'not-a-uuid' })).toBeNull();
            expect(await checkpoints.findOneById('not-a-uuid')).toBeNull();
        });

        it('a checkpoint of a missing or malformed run is EntityRelationError naming the run, and nothing is stored', async () => {
            for (const [index, runId] of [testUuid('missing'), 'not-a-uuid'].entries()) {
                const error = await checkpoints.save(checkpoints.create(checkpointOf(testUuid(`c${index}`), runId)))
                    .catch((caught: unknown) => caught);

                expect(error).toBeInstanceOf(EntityRelationError);
                expect(error).toMatchObject({ entity: 'checkpoint', relation: 'run' });
            }

            expect(await checkpoints.findOneById(testUuid('c0'))).toBeNull();
        });

        it('a second created checkpoint of one run is EntityConflictError and leaves the stored row', async () => {
            await checkpoints.save(checkpoints.create(checkpointOf(testUuid('c1'), testUuid('r1'), { stepIndex: 1 })));

            await expect(checkpoints.save(checkpoints.create(checkpointOf(testUuid('c2'), testUuid('r1'), { stepIndex: 2 }))))
                .rejects.toBeInstanceOf(EntityConflictError);
            expect((await checkpoints.findOneBy({ runId: testUuid('r1') }))!.stepIndex).toBe(1);
        });

        it('save of a read checkpoint writes its changes: a property set to undefined is cleared', async () => {
            await checkpoints.save(checkpoints.create(checkpointOf(testUuid('c1'), testUuid('r1'), { finishReason: 'stop' })));

            const read = (await checkpoints.findOneBy({ runId: testUuid('r1') }))!;

            checkpoints.merge(read, {
                stepIndex: 2,
                messages: [],
                finishReason: undefined,
                createdAt: new Date(2_000),
            });

            const saved = await checkpoints.save(read);
            const stored = (await checkpoints.findOneBy({ runId: testUuid('r1') }))!;

            expect(stored).toEqual({
                id: testUuid('c1'),
                runId: testUuid('r1'),
                stepIndex: 2,
                messages: [],
                createdAt: new Date(2_000),
            });
            expect(stored).not.toHaveProperty('finishReason');
            expect(saved).toStrictEqual(stored);
        });

        it('copies values in and out', async () => {
            const checkpoint = checkpointOf(testUuid('c1'), testUuid('r1'));

            await checkpoints.save(checkpoints.create(checkpoint));
            checkpoint.messages.push({ role: 'user', content: 'later' });

            const read = (await checkpoints.findOneBy({ runId: testUuid('r1') }))!;

            expect(read.messages).toHaveLength(1);
            read.messages.push({ role: 'user', content: 'x' });
            expect((await checkpoints.findOneBy({ runId: testUuid('r1') }))!.messages).toHaveLength(1);
        });

        it('concurrent first checkpoints of one run: exactly one is stored, the others are EntityConflictError', async () => {
            const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => checkpoints.save(checkpoints.create(
                checkpointOf(testUuid(`c${i}`), testUuid('r1'), { stepIndex: i }),
            ))));
            const stored = results.findIndex((result) => result.status === 'fulfilled');

            expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
            expect(results.filter((result) => result.status === 'rejected')
                .every((result) => (result as PromiseRejectedResult).reason instanceof EntityConflictError)).toBe(true);
            expect((await checkpoints.findOneBy({ runId: testUuid('r1') }))!.stepIndex).toBe(stored);
        });

        it('transactions that read and save one checkpoint apply one after the other: no change is lost', async () => {
            await checkpoints.save(checkpoints.create(checkpointOf(testUuid('c1'), testUuid('r1'), { stepIndex: 0 })));

            const increment = () => checkpoints.transaction(async (repository) => {
                const checkpoint = (await repository.findOneBy({ runId: testUuid('r1') }))!;

                // other transactions get their turn between the read and the write
                await Promise.resolve();
                await Promise.resolve();
                repository.merge(checkpoint, { stepIndex: checkpoint.stepIndex + 1 });
                await repository.save(checkpoint);
            });

            await Promise.all(Array.from({ length: 10 }, () => increment()));
            expect((await checkpoints.findOneBy({ runId: testUuid('r1') }))!.stepIndex).toBe(10);
        });
    });
}
