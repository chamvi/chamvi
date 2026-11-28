/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityQueryError, EntityRelationError } from '@chamvi/errors';
import { defineQuery, eq } from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { STEP_STORED_ORDER } from '@chamvi/core-kit';
import type { Step } from '@chamvi/core-kit';
import type { IRunRepository, IStepRepository } from '@chamvi/store';
import {
    UUID_V7,
    makeRun,
    testUuid,
    testUuidV7,
} from '../fixture/helpers.ts';
import type { StepRepositoryContractInput } from './types.ts';

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/** The counter of the uuid v7 `stepOf` gives a step without one: unique across a spec file. */
let lastStepId = 0;

function stepOf(runId: string, index: number, patch: Partial<Step> = {}): Step {
    lastStepId++;

    return {
        id: testUuidV7(1_000, lastStepId),
        runId,
        index,
        kind: 'llm',
        startedAt: new Date(1_000 + index),
        finishedAt: new Date(2_000 + index),
        ...patch,
    };
}

/** The query the step service lists a run's steps with: by index, then in the order they were stored. */
function stepsOf(runId: string) {
    return defineQuery({ filters: eq('runId', runId), sorts: { index: 'ASC', [STEP_STORED_ORDER]: 'ASC' } });
}

/**
 * The storage behaviour of an `IStepRepository`: steps appended and listed
 * by index, then insertion order, the run reference, copies, concurrent
 * appends, and a locked run that never blocks appending its steps.
 */
export function describeStepRepositoryContract(input: StepRepositoryContractInput): void {
    describe(`step repository contract: ${input.name}`, () => {
        let runs: IRunRepository;
        let steps: IStepRepository;

        beforeEach(async () => {
            ({ runs, steps } = await input.create());
            await runs.save(runs.create(makeRun(testUuid('r1'))));
            await runs.save(runs.create(makeRun(testUuid('r2'))));
        });

        it('stores every field and the uuid v7 id as given, reads absent ones as absent and returns no storage order', async () => {
            const full = stepOf(testUuid('r1'), 0, {
                kind: 'tool',
                name: 'deploy',
                input: { a: [1, 'two', null] },
                output: 'done',
                error: { code: 'x', message: 'y' },
            });
            const bare = stepOf(testUuid('r1'), 1);

            expect(await steps.save(steps.create(full))).toEqual(full);
            await steps.save(steps.create(bare));

            const { data } = await steps.findMany(stepsOf(testUuid('r1')));

            expect(data).toEqual([full, bare]);
            expect(data[0]!.id).toMatch(UUID_V7);
            expect(data[0]!.startedAt).toBeInstanceOf(Date);
            expect(data[0]).not.toHaveProperty(STEP_STORED_ORDER);

            for (const field of ['name', 'input', 'output', 'error', STEP_STORED_ORDER]) {
                expect(data[1]).not.toHaveProperty(field);
            }
        });

        it('steps of one index read in the order they were stored, not by id: two ids of one millisecond stored in reverse', async () => {
            const first = stepOf(testUuid('r1'), 0, { id: testUuidV7(5_000, 2), name: 'first' });
            const second = stepOf(testUuid('r1'), 0, { id: testUuidV7(5_000, 1), name: 'second' });

            await steps.save(steps.create(first));
            await steps.save(steps.create(second));

            const { data } = await steps.findMany(stepsOf(testUuid('r1')));

            expect(data.map((step) => step.id)).toEqual([first.id, second.id]);
            expect(await steps.findOneById(second.id)).toEqual(second);
        });

        it('lists one run\'s steps by index, then in the order they were stored', async () => {
            await steps.save(steps.create(stepOf(testUuid('r1'), 2, { name: 'c' })));
            await steps.save(steps.create(stepOf(testUuid('r1'), 0, { name: 'a' })));
            await steps.save(steps.create(stepOf(testUuid('r2'), 0, { name: 'other' })));
            await steps.save(steps.create(stepOf(testUuid('r1'), 1, { name: 'b1' })));
            await steps.save(steps.create(stepOf(testUuid('r1'), 1, { name: 'b2' })));

            const { data, meta } = await steps.findMany(stepsOf(testUuid('r1')));

            expect(data.map((step) => step.name)).toEqual(['a', 'b1', 'b2', 'c']);
            expect(meta.total).toBe(4);
            expect((await steps.findMany(stepsOf(testUuid('missing')))).data).toEqual([]);
            expect((await steps.findMany(stepsOf('not-a-uuid'))).data).toEqual([]);
        });

        it('keeps the order steps were saved in, not the order they were created in', async () => {
            const a = steps.create(stepOf(testUuid('r1'), 0, { name: 'a' }));
            const b = steps.create(stepOf(testUuid('r1'), 0, { name: 'b' }));

            await steps.save(b);
            await steps.save(a);

            expect((await steps.findMany(stepsOf(testUuid('r1')))).data.map((step) => step.name)).toEqual(['b', 'a']);
        });

        it('a step of a missing or malformed run is EntityRelationError naming the run, and nothing is stored', async () => {
            for (const runId of [testUuid('missing'), 'not-a-uuid']) {
                const error = await steps.save(steps.create(stepOf(runId, 0))).catch((caught: unknown) => caught);

                expect(error).toBeInstanceOf(EntityRelationError);
                expect(error).toMatchObject({ entity: 'step', relation: 'run' });
            }

            expect((await steps.findMany(defineQuery({}))).meta.total).toBe(0);
        });

        it('steps are append-only: upsert and upsertMany are EntityQueryError and store nothing', async () => {
            await expect(steps.upsert(steps.create(stepOf(testUuid('r1'), 0)))).rejects.toBeInstanceOf(EntityQueryError);
            await expect(steps.upsertMany([stepOf(testUuid('r1'), 1)])).rejects.toBeInstanceOf(EntityQueryError);
            expect((await steps.findMany(defineQuery({}))).meta.total).toBe(0);
        });

        it('copies values in and out', async () => {
            const step = stepOf(testUuid('r1'), 0, { input: { a: 1 } });

            await steps.save(steps.create(step));
            (step.input as { a: number }).a = 2;

            const [read] = (await steps.findMany(stepsOf(testUuid('r1')))).data;

            expect(read!.input).toEqual({ a: 1 });
            (read!.input as { a: number }).a = 3;
            expect((await steps.findMany(stepsOf(testUuid('r1')))).data[0]!.input).toEqual({ a: 1 });
        });

        it('concurrent appends of one run are all stored', async () => {
            await Promise.all(Array.from({ length: 20 }, (_, i) => steps.save(steps.create(stepOf(testUuid('r1'), i % 3, { name: `s${i}` })))));

            const { data } = await steps.findMany(stepsOf(testUuid('r1')));

            expect(data).toHaveLength(20);
            expect(new Set(data.map((step) => step.name)).size).toBe(20);
        });

        it('a run locked by a transaction does not block appending its step', async () => {
            const { promise: locked, resolve: lock } = Promise.withResolvers<void>();
            let appended = false;
            const holder = runs.transaction(async (repository) => {
                await repository.findOneById(testUuid('r1'));
                lock();

                for (let i = 0; i < 100 && !appended; i++) {
                    await pause(10);
                }

                return appended;
            });

            await locked;
            await steps.save(steps.create(stepOf(testUuid('r1'), 0)));
            appended = true;
            expect(await holder).toBe(true);
        });
    });
}
