/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { findApprovalWaitBelow } from '@chamvi/core';
import { RunStatus } from '@chamvi/store';
import type { Run, WaitPoint } from '@chamvi/store';
import type { RunFindOptions } from '../../../src/run/types.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { createTestServices } from '../../utils/engine.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

let created = 0;

function makeRun(id: string, parentRunId?: string, overrides: Partial<Run> = {}): Run {
    const at = new Date(START.getTime() + created++);

    return {
        id,
        agent: 'lead',
        status: RunStatus.RUNNING,
        trigger: {
            id: `t-${id}`,
            agent: 'lead',
            trigger: 'test',
            channel: parentRunId === undefined ? 'test' : 'agent',
            payload: {},
            receivedAt: at,
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
        createdAt: at,
        updatedAt: at,
        ...overrides,
    } as Run;
}

const dispatchWait = (runIds: string[]): WaitPoint => ({
    kind: 'dispatch',
    id: '0:c1:w0',
    toolName: 'fan',
    toolCallId: 'c1',
    runIds,
    expiresAt: new Date(START.getTime() + 60_000),
});

const approvalWait: WaitPoint = {
    kind: 'approval',
    id: '0:c1:0',
    approvalId: '0:c1:0',
    toolName: 'ask',
    toolCallId: 'c1',
    title: 'Go on?',
    expiresAt: new Date(START.getTime() + 60_000),
};

function recordingStore() {
    const store = createTestServices({ clock: new ControllableClock(START) });
    const finds: RunFindOptions[] = [];
    const find = store.runService.find.bind(store.runService);

    store.runService.find = async (q = {}) => {
        finds.push(q);

        return find(q);
    };

    return { store, finds };
}

describe('findApprovalWaitBelow', () => {
    it('a fan-out of many children costs one find per level', async () => {
        const { store, finds } = recordingStore();
        const ids = Array.from({ length: 30 }, (_, i) => `c${i}`);

        await store.runService.create(makeRun('root', undefined, { status: RunStatus.WAITING, waiting: dispatchWait(ids) }));

        for (const id of ids) {
            await store.runService.create(makeRun(id, 'root'));
            await store.runService.create(makeRun(`g-${id}`, id));
        }

        await store.runService.update('g-c17', { status: RunStatus.WAITING, waiting: approvalWait });

        const root = await store.runService.findOneOrFail('root');

        finds.length = 0;

        const found = await findApprovalWaitBelow(store.runService, root);

        expect(found?.id).toBe('g-c17');
        expect(finds).toHaveLength(2);
        expect(finds[0]?.parentRunIds).toEqual(['root']);
        expect(finds[1]?.parentRunIds).toEqual(ids);
    });

    it('follows a named run another run dispatched, each run once', async () => {
        const { store, finds } = recordingStore();

        await store.runService.create(makeRun('other'));
        await store.runService.create(makeRun('shared', 'other'));
        await store.runService.create(makeRun('root', undefined, { status: RunStatus.WAITING, waiting: dispatchWait(['shared', 'own']) }));
        await store.runService.create(makeRun('own', 'root', { status: RunStatus.WAITING, waiting: dispatchWait(['shared']) }));
        await store.runService.create(makeRun('leaf', 'shared', { status: RunStatus.WAITING, waiting: approvalWait }));

        const root = await store.runService.findOneOrFail('root');

        finds.length = 0;

        expect((await findApprovalWaitBelow(store.runService, root))?.id).toBe('leaf');
        // level 1: own (child), then shared (named); level 2: their children, shared named again but visited
        expect(finds).toEqual([
            { parentRunIds: ['root'], status: expect.any(Array) },
            { ids: ['shared'], status: expect.any(Array) },
            { parentRunIds: ['own', 'shared'], status: expect.any(Array) },
        ]);
    });

    it('skips settled subtrees and is undefined without an approval wait', async () => {
        const { store } = recordingStore();

        await store.runService.create(makeRun('root', undefined, { status: RunStatus.WAITING, waiting: dispatchWait(['done']) }));
        await store.runService.create(makeRun('done', 'root'));
        await store.runService.create(makeRun('below', 'done', { status: RunStatus.WAITING, waiting: approvalWait }));
        await store.runService.update('done', { status: RunStatus.COMPLETED });

        expect(await findApprovalWaitBelow(store.runService, await store.runService.findOneOrFail('root'))).toBeUndefined();
    });
});
