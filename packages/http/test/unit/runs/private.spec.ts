/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import { defineModelAgent } from '@chamvi/core';
import type { IStore } from '@chamvi/core';
import { http } from '@chamvi/http';
import {
    ADMIN_TOKEN,
    READER_TOKEN,
    call,
    createTestApp,
    restricted,
    tokenFor,
} from '../../utils/app.ts';
import { callTool, connectMcp } from '../../utils/mcp.ts';
import { textModel } from '../../utils/model.ts';
import { readEvents } from '../../utils/sse.ts';

const OWNER_TOKEN = tokenFor(restricted(Permission.AGENT_READ, { name: 'alfred' }));
const RUNNER_TOKEN = tokenFor(restricted(Permission.AGENT_RUN, { name: 'alfred' }));

/** A private `alfred` and a public `bob`, each with one completed run (alfred's with one attachment). */
async function setup() {
    const ctx = createTestApp({
        agents: [
            defineModelAgent({
                name: 'alfred',
                model: textModel(),
                instructions: 'Alfred.',
                channels: [http.on()],
                private: true,
            }),
            defineModelAgent({
                name: 'bob',
                model: textModel(),
                instructions: 'Bob.',
                channels: [http.on()],
            }),
        ],
    });
    const alfred = await ctx.engine.dispatch({
        agent: 'alfred',
        trigger: 'http',
        channel: 'http',
        payload: {},
        attachments: [{ mediaType: 'text/plain', data: new Uint8Array([104, 105]) }],
    });
    const bob = await ctx.engine.dispatch({
        agent: 'bob',
        trigger: 'http',
        channel: 'http',
        payload: {},
    });

    await ctx.engine.start();
    await ctx.engine.idle();

    const [artifact] = await ctx.store.artifacts.find(alfred.runId);

    return {
        ...ctx,
        alfred: alfred.runId,
        bob: bob.runId,
        artifactId: artifact!.id,
    };
}

/** A completed run of `ghost`, an agent the app does not hold. */
async function insertGhostRun(store: IStore): Promise<string> {
    const at = new Date(2_000_000);

    await store.runs.insert({
        id: 'ghost-run',
        agent: 'ghost',
        status: 'completed',
        trigger: {
            id: 't-ghost',
            agent: 'ghost',
            trigger: 'http',
            channel: 'http',
            payload: {},
            receivedAt: at,
        },
        output: 'secret',
        usage: { inputTokens: 1, outputTokens: 1 },
        createdAt: at,
        updatedAt: at,
    });

    return 'ghost-run';
}

describe('private agents: single-run routes', () => {
    it('answers GET /runs/:id with 404 without chamvi_agent_read', async () => {
        const ctx = await setup();
        const path = `/runs/${ctx.alfred}`;

        const denied = await call(ctx.app, 'GET', path, { token: READER_TOKEN });

        const missing = await call(ctx.app, 'GET', '/runs/missing', { token: READER_TOKEN });
        const deniedBody = await denied.json();
        const missingBody = await missing.json();

        // indistinguishable from an unknown run
        expect(denied.status).toBe(404);
        expect(missing.status).toBe(404);
        expect(deniedBody.message).toBe(`Run "${ctx.alfred}" was not found.`);
        expect(missingBody.message).toBe('Run "missing" was not found.');
        expect(deniedBody.code).toBe(missingBody.code);
        expect((await call(ctx.app, 'GET', path, { token: RUNNER_TOKEN })).status).toBe(404);
        expect((await call(ctx.app, 'GET', path, { token: OWNER_TOKEN })).status).toBe(200);
        expect((await call(ctx.app, 'GET', path, { token: ADMIN_TOKEN })).status).toBe(200);
        expect((await call(ctx.app, 'GET', `/runs/${ctx.bob}`, { token: READER_TOKEN })).status).toBe(200);
        await ctx.engine.drain();
    });

    it('applies the same answers to the stream, the artifact list and one artifact', async () => {
        const ctx = await setup();
        const paths = [
            `/runs/${ctx.alfred}/stream`,
            `/runs/${ctx.alfred}/artifacts`,
            `/runs/${ctx.alfred}/artifacts/${ctx.artifactId}`,
        ];

        for (const path of paths) {
            const headers = path.endsWith('/stream') ? { accept: 'text/event-stream' } : undefined;

            for (const token of [READER_TOKEN, RUNNER_TOKEN]) {
                const response = await call(ctx.app, 'GET', path, { token, ...(headers ? { headers } : {}) });

                expect(response.status, `${path} ${token}`).toBe(404);
                expect(response.headers.get('content-type') ?? '').not.toContain('text/event-stream');
            }

            for (const token of [OWNER_TOKEN, ADMIN_TOKEN]) {
                const controller = new AbortController();
                const response = await call(ctx.app, 'GET', path, {
                    token,
                    signal: controller.signal,
                    ...(headers ? { headers } : {}),
                });

                expect(response.status, `${path} ${token}`).toBe(200);
                controller.abort();
                await response.body?.cancel().catch(() => {});
            }
        }

        await ctx.engine.drain();
    });

    it('fails closed for a run of an agent the app does not hold', async () => {
        const ctx = await setup();
        const ghost = await insertGhostRun(ctx.store);

        expect((await call(ctx.app, 'GET', `/runs/${ghost}`, { token: READER_TOKEN })).status).toBe(404);
        expect((await call(ctx.app, 'GET', `/runs/${ghost}`, { token: ADMIN_TOKEN })).status).toBe(200);
        expect((await call(ctx.app, 'GET', `/runs/${ghost}`, { token: tokenFor(restricted(Permission.AGENT_READ, { name: 'ghost' })) })).status).toBe(200);
        await ctx.engine.drain();
    });
});

describe('private agents: GET /runs', () => {
    type ListBody = { data: Array<{ id: string; agent: string }>; meta: { total: number } };

    it('lists only the runs a chamvi_run_read principal may read, with an exact total', async () => {
        const ctx = await setup();

        await insertGhostRun(ctx.store);

        const body = await (await call(ctx.app, 'GET', '/runs', { token: READER_TOKEN })).json() as ListBody;

        expect(body.data.map((run) => run.agent)).toEqual(['bob']);
        expect(body.meta.total).toBe(1);
        await ctx.engine.drain();
    });

    it('lists every run for a principal holding an unrestricted chamvi_agent_read', async () => {
        const ctx = await setup();

        await insertGhostRun(ctx.store);

        const admin = await (await call(ctx.app, 'GET', '/runs', { token: ADMIN_TOKEN })).json() as ListBody;

        expect(admin.data.map((run) => run.agent).sort()).toEqual(['alfred', 'bob', 'ghost']);
        expect(admin.meta.total).toBe(3);

        const wide = await (await call(ctx.app, 'GET', '/runs', { token: tokenFor(Permission.AGENT_READ) })).json() as ListBody;

        expect(wide.meta.total).toBe(3);
        await ctx.engine.drain();
    });

    it('reads every run it lists for a principal holding an unrestricted chamvi_agent_read', async () => {
        const ctx = await setup();
        const token = tokenFor(Permission.AGENT_READ);

        for (const id of [ctx.alfred, ctx.bob]) {
            expect((await call(ctx.app, 'GET', `/runs/${id}`, { token })).status).toBe(200);
            expect((await call(ctx.app, 'GET', `/runs/${id}/artifacts`, { token })).status).toBe(200);
        }

        await ctx.engine.drain();
    });

    it('reads and lists a public agent\'s runs with that agent\'s read grant alone', async () => {
        const ctx = await setup();
        const token = tokenFor(restricted(Permission.AGENT_READ, { name: 'bob' }));

        expect((await call(ctx.app, 'GET', `/runs/${ctx.bob}`, { token })).status).toBe(200);
        expect((await call(ctx.app, 'GET', `/runs/${ctx.alfred}`, { token })).status).toBe(404);

        const body = await (await call(ctx.app, 'GET', '/runs?filter[agent]=bob', { token })).json() as ListBody;

        expect(body.data.map((run) => run.agent)).toEqual(['bob']);
        await ctx.engine.drain();
    });

    it('adds the private agents a chamvi_run_read principal holds the read grant of', async () => {
        const ctx = await setup();
        const token = tokenFor(Permission.RUN_READ, restricted(Permission.AGENT_READ, { name: 'alfred' }));
        const body = await (await call(ctx.app, 'GET', '/runs', { token })).json() as ListBody;

        expect(body.data.map((run) => run.agent).sort()).toEqual(['alfred', 'bob']);
        expect(body.meta.total).toBe(2);
        await ctx.engine.drain();
    });

    it('lists the runs of an agent the app does not hold only for an unrestricted read grant', async () => {
        const ctx = await setup();
        const ghost = await insertGhostRun(ctx.store);
        const named = tokenFor(Permission.RUN_READ, restricted(Permission.AGENT_READ, { name: 'ghost' }));
        const body = await (await call(ctx.app, 'GET', '/runs', { token: named })).json() as ListBody;

        // a policy cannot name agents the app does not hold, so the listing covers registered agents
        expect(body.data.map((run) => run.agent)).toEqual(['bob']);
        expect(body.meta.total).toBe(1);
        // the single read and the filtered listing still follow the grant
        expect((await call(ctx.app, 'GET', `/runs/${ghost}`, { token: named })).status).toBe(200);
        expect((await call(ctx.app, 'GET', '/runs?filter[agent]=ghost', { token: named })).status).toBe(200);

        const wide = await (await call(ctx.app, 'GET', '/runs', { token: tokenFor(Permission.AGENT_READ) })).json() as ListBody;

        expect(wide.data.map((run) => run.id)).toContain(ghost);
        await ctx.engine.drain();
    });

    it('answers 403 for filter[agent] naming a private agent without the read grant', async () => {
        const ctx = await setup();

        for (const token of [READER_TOKEN, RUNNER_TOKEN]) {
            const denied = await call(ctx.app, 'GET', '/runs?filter[agent]=alfred', { token });

            expect(denied.status).toBe(403);
            expect((await denied.json()).message).toBe('Reading runs of agent "alfred" needs chamvi_agent_read.');
        }

        const owned = await call(ctx.app, 'GET', '/runs?filter[agent]=alfred', { token: OWNER_TOKEN });

        expect(owned.status).toBe(200);
        expect(((await owned.json()) as ListBody).meta.total).toBe(1);
        await ctx.engine.drain();
    });
});

describe('agentPrivate on the run wire', () => {
    it('is the agent\'s private flag, an agent the app does not hold counting as private', async () => {
        const ctx = await setup();

        await insertGhostRun(ctx.store);

        const flagOf = async (id: string) => (await (await call(ctx.app, 'GET', `/runs/${id}`, { token: ADMIN_TOKEN })).json()).agentPrivate;

        expect(await flagOf(ctx.bob)).toBe(false);
        expect(await flagOf(ctx.alfred)).toBe(true);
        expect(await flagOf('ghost-run')).toBe(true);

        const list = await (await call(ctx.app, 'GET', '/runs', { token: ADMIN_TOKEN })).json() as { data: Array<{ id: string; agentPrivate: boolean }> };

        expect(Object.fromEntries(list.data.map((run) => [run.id, run.agentPrivate]))).toEqual({
            [ctx.alfred]: true,
            [ctx.bob]: false,
            'ghost-run': true,
        });

        const stream = await call(ctx.app, 'GET', `/runs/${ctx.bob}/stream`, { token: ADMIN_TOKEN });
        const [updated] = await readEvents(stream, 1);

        expect(updated?.event).toBe('run.updated');
        expect(JSON.parse(updated!.data).agentPrivate).toBe(false);

        const client = await connectMcp(ctx.app, ADMIN_TOKEN);
        const read = await callTool(client, 'get_run', { runId: ctx.alfred });

        expect((read.structuredContent as { agentPrivate: boolean }).agentPrivate).toBe(true);
        await client.close();
        await ctx.engine.drain();
    });
});
