/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { defineAgent } from '@chamvi/core';
import type { IStore } from '@chamvi/core';
import { http } from '@chamvi/http';
import {
    ADMIN_TOKEN,
    READER_TOKEN,
    call,
    createRunTestApp,
    createTestApp,
    tokenFor,
} from '../../utils/app.ts';
import { textModel } from '../../utils/model.ts';

async function setup() {
    const ctx = createRunTestApp();
    const ids: string[] = [];

    for (const agent of ['echo', 'gate', 'echo']) {
        const response = await call(ctx.app, 'POST', `/agents/${agent}/runs`, { token: ADMIN_TOKEN });

        ids.push((await response.json() as { runId: string }).runId);
        ctx.clock.advance(1);
    }

    return { ...ctx, ids };
}

/** Inserts one child of `parentId` per agent, in that order; returns their ids. */
async function insertChildren(store: IStore, parentId: string, agents: string[]): Promise<string[]> {
    const parent = await store.runs.findOneOrFail(parentId);
    const ids: string[] = [];

    for (const [index, agent] of agents.entries()) {
        const id = `${parentId}-child-${index}`;
        const at = new Date(parent.createdAt.getTime() + 10 + index);

        await store.runs.insert({
            id,
            agent,
            status: 'completed',
            trigger: {
                id: `t-${id}`,
                agent,
                trigger: 'default',
                channel: 'dispatch',
                payload: {},
                parent: {
                    kind: 'dispatch',
                    runId: parentId,
                    agent: parent.agent,
                    role: 'default',
                    depth: 1,
                },
                receivedAt: at,
            },
            usage: { inputTokens: 1, outputTokens: 1 },
            subtreeUsage: { inputTokens: 3, outputTokens: 4 },
            createdAt: at,
            updatedAt: at,
        });
        ids.push(id);
    }

    return ids;
}

type ListBody = {
    data: Array<Record<string, unknown>>;
    meta: {
        total: number;
        limit: number;
        offset: number
    }
};

describe('GET /runs', () => {
    it('filters by agent and leaves out the claim', async () => {
        const { app, ids } = await setup();
        const response = await call(app, 'GET', '/runs?filter[agent]=echo', { token: READER_TOKEN });

        expect(response.status).toBe(200);

        const body = await response.json() as ListBody;

        expect(body.meta).toEqual({
            total: 2,
            limit: 50,
            offset: 0,
        });
        expect(body.data.map((run) => run.id)).toEqual([ids[0], ids[2]]);

        for (const run of body.data) {
            expect(run).not.toHaveProperty('claim');
        }
    });

    it('pages by createdAt', async () => {
        const { app, ids } = await setup();
        const body = await (await call(app, 'GET', '/runs?page[limit]=1&page[offset]=1', { token: READER_TOKEN })).json() as ListBody;

        expect(body.data.map((run) => run.id)).toEqual([ids[1]]);
        expect(body.meta).toEqual({
            total: 3,
            limit: 1,
            offset: 1,
        });
    });

    it('GET /runs?sort=-createdAt lists newest first', async () => {
        const { app, ids } = await setup();
        const body = await (await call(app, 'GET', '/runs?sort=-createdAt', { token: READER_TOKEN })).json() as ListBody;

        expect(body.data.map((run) => run.id)).toEqual([ids[2], ids[1], ids[0]]);

        const page = await (await call(app, 'GET', '/runs?sort=-createdAt&page[limit]=1&page[offset]=1', { token: READER_TOKEN })).json() as ListBody;

        expect(page.data.map((run) => run.id)).toEqual([ids[1]]);
        expect(page.meta.total).toBe(3);
    });

    it('accepts percent-encoded brackets', async () => {
        const { app } = await setup();
        const body = await (await call(app, 'GET', '/runs?filter%5Bagent%5D=echo', { token: READER_TOKEN })).json() as ListBody;

        expect(body.meta.total).toBe(2);
    });

    it('lets a principal filter to an agent named like a number', async () => {
        const { app } = createTestApp({
            agents: [defineAgent({
                name: '007',
                model: textModel(),
                instructions: 'Count.',
                channels: [http.on()],
            })],
        });
        const token = tokenFor('agent:007:run');

        expect((await call(app, 'POST', '/agents/007/runs', { token })).status).toBe(202);

        for (const query of ['filter[agent]=007', 'filter=eq(agent,\'007\')']) {
            const response = await call(app, 'GET', `/runs?${query}`, { token });

            expect(response.status).toBe(200);
            expect((await response.json() as ListBody).meta.total).toBe(1);
        }
    });

    it('lets run:read list without a filter', async () => {
        const { app } = await setup();

        expect((await call(app, 'GET', '/runs', { token: READER_TOKEN })).status).toBe(200);
    });

    it('needs a filter to a runnable agent without run:read', async () => {
        const { app } = await setup();
        const token = tokenFor('agent:echo:run');
        const denied = await call(app, 'GET', '/runs', { token });

        expect(denied.status).toBe(403);
        expect((await denied.json()).message).toBe('Missing permission "run:read".');
        expect((await call(app, 'GET', '/runs?filter[agent]=echo', { token })).status).toBe(200);
        expect((await call(app, 'GET', '/runs?filter[agent]=gate', { token })).status).toBe(403);
        expect((await call(app, 'GET', '/runs')).status).toBe(401);
    });

    it('lists a run\'s children', async () => {
        const {
            app,
            store,
            ids,
        } = await setup();
        const [parentId] = ids as [string];
        const children = await insertChildren(store, parentId, ['echo', 'gate']);
        const body = await (await call(app, 'GET', `/runs?filter[parent]=${parentId}`, { token: READER_TOKEN })).json() as ListBody;

        expect(body.meta.total).toBe(2);
        expect(body.data.map((run) => run.id)).toEqual(children);

        for (const run of body.data) {
            expect(run.parentRunId).toBe(parentId);
            expect(run.subtreeUsage).toEqual({ inputTokens: 3, outputTokens: 4 });
        }

        const none = await (await call(app, 'GET', `/runs?filter[parent]=${ids[1]}`, { token: READER_TOKEN })).json() as ListBody;

        expect(none.meta.total).toBe(0);

        const echo = await (await call(app, 'GET', `/runs?filter[parent]=${parentId}&filter[agent]=echo`, { token: READER_TOKEN })).json() as ListBody;

        expect(echo.data.map((run) => run.id)).toEqual([children[0]]);
    });

    it('an agent-scoped reader sees only children of its agent with filter[agent], 403 without', async () => {
        const {
            app,
            store,
            ids,
        } = await setup();
        const [parentId] = ids as [string];
        const children = await insertChildren(store, parentId, ['echo', 'gate']);
        const token = tokenFor('agent:echo:run');

        expect((await call(app, 'GET', `/runs?filter[parent]=${parentId}`, { token })).status).toBe(403);
        expect((await call(app, 'GET', `/runs?filter[parent]=${parentId}&filter[agent]=gate`, { token })).status).toBe(403);

        const response = await call(app, 'GET', `/runs?filter[parent]=${parentId}&filter[agent]=echo`, { token });

        expect(response.status).toBe(200);
        expect((await response.json() as ListBody).data.map((run) => run.id)).toEqual([children[0]]);
    });

    it('filters by wait point kind on the server, paged', async () => {
        const {
            app,
            store,
            ids,
        } = await setup();
        const [first, second, third] = ids as [string, string, string];
        const expiresAt = new Date(Date.now() + 60_000);
        const approval = (id: string) => ({
            kind: 'approval' as const,
            id,
            approvalId: id,
            toolName: 'deploy',
            toolCallId: 'c1',
            title: 'Deploy?',
            expiresAt,
        });

        await store.runs.update(first, { status: 'waiting', waiting: approval('0:c1:0') });
        await store.runs.update(second, {
            status: 'waiting',
            waiting: {
                kind: 'dispatch',
                id: '0:c2:w0',
                toolName: 'fan',
                toolCallId: 'c2',
                runIds: [first],
                expiresAt,
            },
        });
        await store.runs.update(third, { status: 'waiting', waiting: approval('0:c1:1') });

        const approvals = await (await call(app, 'GET', '/runs?filter[status]=waiting&filter[waiting]=approval&page[limit]=1', { token: READER_TOKEN })).json() as ListBody;

        expect(approvals.data.map((run) => run.id)).toEqual([first]);
        expect(approvals.meta.total).toBe(2);

        const dispatches = await (await call(app, 'GET', '/runs?filter[waiting]=dispatch', { token: READER_TOKEN })).json() as ListBody;

        expect(dispatches.data.map((run) => run.id)).toEqual([second]);

        for (const query of ['filter[waiting]=human', 'filter[waiting]=approval,dispatch', 'filter[waiting]=!approval']) {
            const response = await call(app, 'GET', `/runs?${query}`, { token: READER_TOKEN });

            expect(response.status).toBe(400);
            expect((await response.json()).message).toBe('filter[waiting] takes approval or dispatch.');
        }
    });

    it('answers 400 JSON with issues for a rejected query', async () => {
        const { app } = await setup();
        const response = await call(app, 'GET', '/runs?filter[nope]=1', { token: READER_TOKEN });

        expect(response.status).toBe(400);

        const body = await response.json();

        expect(body.code).toBe('bad_request');
        expect(body.issues.length).toBeGreaterThan(0);
    });
});
