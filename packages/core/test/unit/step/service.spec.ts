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
import { RunStatus } from '@chamvi/store';
import type { Step } from '@chamvi/store';
import { MemoryRegistry, MemoryRunRepository, MemoryStepRepository } from '@chamvi/store-memory';
import {
    RepositoryNotFoundError,
    RunNotFoundError,
    StepService,
} from '../../../src/index.ts';

const RUN_ID = '00000000-0000-4000-8000-000000000001';

function stepOf(index: number, patch: Partial<Step> = {}): Step {
    return {
        runId: RUN_ID,
        index,
        kind: 'llm',
        startedAt: new Date(1_000),
        finishedAt: new Date(2_000),
        ...patch,
    };
}

describe('StepService', () => {
    let service: StepService;

    beforeEach(async () => {
        const registry = new MemoryRegistry();
        const runs = new MemoryRunRepository({ registry });

        await runs.save(runs.create({
            id: RUN_ID,
            agent: 'a',
            status: RunStatus.RUNNING,
            trigger: {
                id: 't',
                agent: 'a',
                trigger: 'http',
                channel: 'http',
                payload: {},
                receivedAt: new Date(0),
            },
            usage: { inputTokens: 0, outputTokens: 0 },
            createdAt: new Date(0),
            updatedAt: new Date(0),
        }));
        service = new StepService({ repository: new MemoryStepRepository({ registry }) });
    });

    it('appends steps and lists a run\'s steps by index, then in the order they were appended', async () => {
        const steps = [
            stepOf(1, {
                name: 'b1',
                kind: 'tool',
                input: { a: 1 },
            }),
            stepOf(0, { name: 'a', output: 'hello' }),
            stepOf(1, {
                name: 'b2',
                kind: 'wait',
                error: { code: 'x' },
            }),
        ];

        for (const step of steps) {
            await service.create(step);
        }

        expect(await service.find(RUN_ID)).toEqual([steps[1], steps[0], steps[2]]);
        expect(await service.findOrFail(RUN_ID)).toEqual([steps[1], steps[0], steps[2]]);
    });

    it('a step of a missing or malformed run is RunNotFoundError naming the run, and nothing is appended', async () => {
        const missing = '00000000-0000-4000-8000-0000000000ff';

        await expect(service.create({ ...stepOf(0), runId: missing })).rejects.toThrow(new RunNotFoundError(missing));
        await expect(service.create({ ...stepOf(0), runId: 'not-a-uuid' })).rejects.toThrow('Run "not-a-uuid" was not found.');
        expect(await service.find(missing)).toEqual([]);
        expect(await service.find('not-a-uuid')).toEqual([]);
    });

    it('findOrFail of a run without steps is RepositoryNotFoundError', async () => {
        await expect(service.findOrFail(RUN_ID)).rejects.toThrow(new RepositoryNotFoundError('steps'));
        await expect(service.findOrFail('missing')).rejects.toThrow('No matching steps were found.');
    });

    it('copies values in and out', async () => {
        const step = stepOf(0, { input: { a: 1 } });

        await service.create(step);
        (step.input as { a: number }).a = 2;
        expect(step).not.toHaveProperty('id');

        const [read] = await service.find(RUN_ID);

        expect(read!.input).toEqual({ a: 1 });
        (read!.input as { a: number }).a = 3;
        expect((await service.find(RUN_ID))[0]!.input).toEqual({ a: 1 });
    });

    it('concurrent appends are all kept', async () => {
        await Promise.all(Array.from({ length: 20 }, (_, i) => service.create(stepOf(i % 2, { name: `s${i}` }))));

        expect(await service.find(RUN_ID)).toHaveLength(20);
    });
});
