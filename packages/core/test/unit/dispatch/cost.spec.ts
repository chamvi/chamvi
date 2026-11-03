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
} from 'vitest';
import {
    Engine,
    RunStatus,
    agent,
    agentChannel,
    defineAgent,
} from '@chamvi/core';
import type { IEngine, Run } from '@chamvi/core';
import { recomputeSubtreeUsage } from '../../../src/engine/dispatch/module.ts';
import type { DispatchEngineContext } from '../../../src/engine/dispatch/types.ts';
import { createMemoryStore } from '../../../src/repository/index.ts';
import type { RunFindOptions } from '../../../src/repository/types.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { mockModel } from '../../utils/mock-model.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

const engines: IEngine[] = [];

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

function makeRun(id: string, overrides: Partial<Run> = {}, parentRunId?: string): Run {
    return {
        id,
        agent: 'lead',
        status: RunStatus.QUEUED,
        trigger: {
            id: `t-${id}`,
            agent: 'lead',
            trigger: 'test',
            channel: parentRunId === undefined ? 'test' : 'agent',
            payload: {},
            receivedAt: START,
            ...(parentRunId === undefined ? {} : {
                parent: {
                    kind: 'dispatch',
                    runId: parentRunId,
                    agent: 'lead',
                    role: 'default',
                    depth: 1,
                },
            }),
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt: START,
        updatedAt: START,
        ...overrides,
    } as Run;
}

/** A memory store whose run finds are recorded. */
function recordingStore(clock: ControllableClock) {
    const store = createMemoryStore({ clock });
    const finds: RunFindOptions[] = [];
    const find = store.runs.find.bind(store.runs);

    store.runs.find = async (q) => {
        finds.push(q);

        return find(q);
    };

    return { store, finds };
}

const isUnsettledListing = (q: RunFindOptions) => q.status !== undefined && q.status.includes(RunStatus.RUNNING) &&
    q.status.includes(RunStatus.QUEUED) && q.parentRunId === undefined;

describe('dispatch poll cost', () => {
    it('a tick on an engine without dispatch roles makes no unsettled-runs read', async () => {
        const clock = new ControllableClock(START);
        const { store, finds } = recordingStore(clock);
        const engine = new Engine({
            store,
            clock,
            agents: [defineAgent({ name: 'solo', instructions: 'You work.', model: mockModel([]) })],
            onError: () => {},
        });

        engines.push(engine);
        finds.length = 0;
        await engine.tick();

        expect(finds.filter(isUnsettledListing)).toEqual([]);
    });

    it('with dispatch roles, the cascade heal reads only runs with a parent', async () => {
        const clock = new ControllableClock(START);
        const { store, finds } = recordingStore(clock);
        const engine = new Engine({
            store,
            clock,
            agents: [defineAgent({
                name: 'lead',
                instructions: 'You lead.',
                model: mockModel([]),
                channels: [agent.on()],
            })],
            channels: [agentChannel()],
            onError: () => {},
        });

        engines.push(engine);
        await store.runs.insert(makeRun('p1', { status: RunStatus.CANCELLED }));
        await store.runs.insert(makeRun('c1', {}, 'p1'));
        await store.runs.insert(makeRun('r1'));
        finds.length = 0;
        await engine.tick();

        const listings = finds.filter(isUnsettledListing);

        expect(listings).toHaveLength(1);
        expect(listings[0]?.hasParent).toBe(true);
        expect((await store.runs.findOne('c1'))?.status).toBe(RunStatus.CANCELLED);
        expect((await store.runs.findOne('r1'))?.status).toBe(RunStatus.QUEUED);
    });
});

describe('subtree recompute cost', () => {
    function context(clock: ControllableClock) {
        const { store, finds } = recordingStore(clock);
        const ctx: DispatchEngineContext = {
            store,
            clock,
            claimTtlMs: 60_000,
            resume: async () => {},
            cancel: async () => {},
            onError: () => {},
            emit: () => {},
        };

        return { store, finds, ctx };
    }

    it('a fan-out of settled leaves costs one children read', async () => {
        const clock = new ControllableClock(START);
        const { store, finds, ctx } = context(clock);

        await store.runs.insert(makeRun('p1', { status: RunStatus.WAITING }));

        for (let i = 0; i < 20; i++) {
            await store.runs.insert(makeRun(`c${i}`, {}, 'p1'));
            await store.runs.update(`c${i}`, { status: RunStatus.COMPLETED, usage: { inputTokens: 1, outputTokens: 2 } });
        }

        finds.length = 0;
        await recomputeSubtreeUsage(ctx, 'p1');

        expect(finds).toEqual([{ parentRunId: 'p1' }]);
        expect((await store.runs.findOneOrFail('p1')).subtreeUsage).toEqual({ inputTokens: 20, outputTokens: 40 });
    });

    it('the re-check reads only the children that may still move', async () => {
        const clock = new ControllableClock(START);
        const { store, finds, ctx } = context(clock);

        await store.runs.insert(makeRun('p1', { status: RunStatus.WAITING }));

        for (let i = 0; i < 5; i++) {
            await store.runs.insert(makeRun(`c${i}`, {}, 'p1'));
            await store.runs.update(`c${i}`, { status: RunStatus.COMPLETED, usage: { inputTokens: 1, outputTokens: 1 } });
        }

        await store.runs.insert(makeRun('busy', {}, 'p1'));
        await store.runs.update('busy', { status: RunStatus.RUNNING });
        await store.runs.insert(makeRun('mid', {}, 'p1'));
        await store.runs.update('mid', { status: RunStatus.COMPLETED, subtreeUsage: { inputTokens: 3, outputTokens: 3 } });
        finds.length = 0;
        await recomputeSubtreeUsage(ctx, 'p1');

        expect(finds).toEqual([{ parentRunId: 'p1' }, { ids: ['busy', 'mid'] }]);
        expect((await store.runs.findOneOrFail('p1')).subtreeUsage).toEqual({ inputTokens: 8, outputTokens: 8 });
    });
});
