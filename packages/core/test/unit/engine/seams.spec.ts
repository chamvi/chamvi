/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { Engine, defineModelAgent } from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import type { Run } from '@chamvi/core-kit';
import { createTestServices, servicesOf } from '../../utils/engine.ts';
import { mockModel } from '../../utils/mock-model.ts';

const agent = defineModelAgent({
    name: 'triage',
    model: mockModel([{ parts: [{ type: 'text', text: 'done' }] }]),
    instructions: 'x',
});

/** Records the calls of the protected hooks a subclass may wrap. */
class HookedEngine extends Engine {
    created: string[] = [];

    finished: Array<{ id: string; status: Run['status'] | undefined }> = [];

    protected override async createRun(...args: Parameters<Engine['createRun']>): Promise<{ runId: string; deduplicated: boolean }> {
        const result = await super.createRun(...args);

        this.created.push(result.runId);

        return result;
    }

    protected override async finish(id: string, patch: Partial<Run>): Promise<Run | undefined> {
        this.finished.push({ id, status: patch.status });

        return super.finish(id, patch);
    }
}

const engines: IEngine[] = [];

afterEach(async () => {
    for (const e of engines) {
        await e.stop();
    }

    engines.length = 0;
});

function make(): HookedEngine {
    const engine = new HookedEngine({
        ...servicesOf(createTestServices()),
        agents: [agent],
        onError: () => {},
    });

    engines.push(engine);

    return engine;
}

describe('Engine subclass hooks', () => {
    it('dispatch creates the run through createRun()', async () => {
        const engine = make();

        const { runId } = await engine.dispatch({
            agent: 'triage',
            trigger: 'http',
            channel: 'http',
            payload: {},
        });

        expect(engine.created).toEqual([runId]);
    });

    it('an execution settles the run through finish()', async () => {
        const engine = make();
        const { runId } = await engine.dispatch({
            agent: 'triage',
            trigger: 'http',
            channel: 'http',
            payload: {},
        });

        await engine.start();

        await vi.waitFor(() => expect(engine.finished).toEqual([{ id: runId, status: 'completed' }]));
    });
});
