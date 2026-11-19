/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import {
    agent,
    agentChannel,
    defineModelAgent,
    defineRemoteAgent,
    defineSimpleAgent,
} from '@chamvi/core';
import type { IPeerResolver } from '@chamvi/core';
import type { Invoker, Run } from '@chamvi/store';
import { ControllableClock, createTestEngine } from '@chamvi/test-kit';
import { http, staticTokens } from '@chamvi/http';
import {
    ADMIN_TOKEN,
    call,
    createTestApp,
    deployTool,
    flush,
    testAuth,
    testChannels,
} from '../../utils/app.ts';
import { approvalModel, textModel } from '../../utils/model.ts';
import { summarizeAgent } from '../../../src/agents/helpers.ts';
import { callTool, connectMcp, textOf } from '../../utils/mcp.ts';

const DEV_TOKEN = 'peer-dev-token-0123456789';
const OPS_TOKEN = 'peer-ops-token-0123456789';

/** `peer-dev` runs and (by its grants) could approve any agent; `peer-ops` holds no grant. */
const peerAuth = staticTokens({
    tokens: [
        {
            value: DEV_TOKEN,
            id: 'peer-dev',
            permissions: [{ permission: { name: Permission.AGENT_RUN } }, { permission: { name: Permission.AGENT_APPROVE } }],
        },
        {
            value: OPS_TOKEN,
            id: 'peer-ops',
            permissions: [],
        },
    ],
});

const PEER_IDS: Record<string, string> = { 'peer-dev': 'dev', 'peer-ops': 'ops' };

function approvalUrl(ref: { runId: string; approvalId: string }): string {
    return `https://receiver.example/runs/${ref.runId}/approvals/${encodeURIComponent(ref.approvalId)}`;
}

/**
 * Recognizes the static tokens `peer-dev` (peer `dev`) and `peer-ops` (peer
 * `ops`); its transports record every remote read in `reads` and answer a
 * running remote run.
 */
function fakeResolver(reads: string[]): IPeerResolver {
    return {
        has: (name) => name === 'dev' || name === 'ops',
        settings: () => ({
            pollMs: 60_000, 
            untrusted: false, 
            outgoing: true, 
        }),
        transport: () => ({
            start: async () => ({ runId: 'unused' }),
            read: async (runId) => {
                reads.push(runId);

                return {
                    id: runId,
                    status: 'running',
                    tainted: false,
                    usage: { inputTokens: 0, outputTokens: 0 },
                };
            },
            cancel: async () => {},
            wake: async () => {},
        }),
        recognize: (invoker) => (invoker?.kind === 'token' ? PEER_IDS[invoker.id] : undefined),
        approvalUrl,
    };
}

function setup() {
    const clock = new ControllableClock(new Date(1_000_000));
    const errors: unknown[] = [];
    const reads: string[] = [];
    const engine = createTestEngine({
        agents: [
            defineModelAgent({
                name: 'echo',
                model: textModel(),
                instructions: 'Echo.',
                channels: [http.on()],
            }),
            defineModelAgent({
                name: 'worker',
                model: textModel('worked'),
                instructions: 'Work.',
                channels: [agent.on({ role: 'review', from: ['dev/caller', 'ops/caller'] })],
            }),
            defineModelAgent({
                name: 'gate',
                model: approvalModel('deploy'),
                instructions: 'Deploy.',
                channels: [agent.on({ role: 'review', from: ['dev/caller'] })],
                tools: () => ({ deploy: deployTool() }),
            }),
        ],
        clock,
        channels: [...testChannels(), agentChannel()],
        peers: fakeResolver(reads),
        onError: (error) => {
            errors.push(error);
        },
    });
    const { app } = createTestApp({ engine, auth: [testAuth, peerAuth] });

    return {
        app,
        engine,
        errors,
        reads,
    };
}

function peerBody(patch: Record<string, unknown> = {}) {
    return {
        payload: 'hi',
        idempotencyKey: 'call-1',
        role: 'review',
        peer: {
            standIn: 'stand-in-1',
            parent: {
                runId: 'caller-run-1', 
                agent: 'caller', 
                depth: 0, 
            },
            taint: true,
            origin: 'Ann',
        },
        ...patch,
    };
}

async function startAsPeer(app: ReturnType<typeof setup>['app'], name: string, token = DEV_TOKEN, body = peerBody()): Promise<string> {
    const response = await call(app, 'POST', `/agents/${name}/runs`, { token, body });

    expect(response.status).toBe(202);

    return (await response.json() as { runId: string }).runId;
}

async function allRuns(engine: ReturnType<typeof setup>['engine']): Promise<Run[]> {
    return (await engine.runService.find({})).data;
}

/** A stand-in run waiting on a remote run of peer `peer`, seeded in the store. */
async function seedStandIn(engine: ReturnType<typeof setup>['engine'], peer: string, wakeRequested = false): Promise<string> {
    const id = `stand-in-${peer}`;
    const now = new Date(engine.clock.now());
    const invoker: Invoker = {
        kind: 'token', 
        id: 'admin', 
        bindings: [], 
    };

    await engine.runService.create({
        id,
        agent: 'echo',
        status: 'waiting',
        waiting: {
            kind: 'remote',
            id: 'remote',
            peer,
            agent: 'worker',
            remoteRunId: 'remote-1',
            expiresAt: new Date(now.getTime() + 60_000),
            ...(wakeRequested ? { wakeRequested } : {}),
        },
        trigger: {
            id: `trigger-${peer}`,
            agent: 'echo',
            trigger: 'http',
            channel: 'http',
            payload: null,
            invoker,
            receivedAt: now,
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt: now,
        updatedAt: now,
    });

    return id;
}

/** Flushes until `done()` holds (at most 50 rounds of pending microtasks and immediates). */
async function waitFor(done: () => boolean): Promise<void> {
    for (let i = 0; i < 50 && !done(); i++) {
        await flush();
    }

    expect(done()).toBe(true);
}

describe('POST /agents/:name/runs with peer fields', () => {
    it('refuses peer fields from a non-peer', async () => {
        const { app, engine } = setup();

        for (const body of [peerBody(), { payload: 'hi', role: 'review' }]) {
            const response = await call(app, 'POST', '/agents/worker/runs', { token: ADMIN_TOKEN, body });

            expect(response.status).toBe(400);
            expect((await response.json()).message).toMatch(/peer credential/);
        }

        expect(await allRuns(engine)).toEqual([]);

        // no claim was taken: the same key starts an ordinary run of an http agent
        const ordinary = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body: { idempotencyKey: 'call-1' } });

        expect(await ordinary.json()).toMatchObject({ deduplicated: false });
    });

    it('refuses an ordinary start with a peer credential, over HTTP and MCP', async () => {
        const { app, engine } = setup();

        // no peer fields: still a peer start, refused for the missing role and peer fields (no untainted ordinary run)
        const response = await call(app, 'POST', '/agents/echo/runs', { token: DEV_TOKEN, body: { payload: 'hi' } });

        expect(response.status).toBe(400);

        const client = await connectMcp(app, DEV_TOKEN);
        const result = await callTool(client, 'run_echo', { payload: 'hi' });

        expect(result.isError).toBe(true);
        expect(textOf(result)).toMatch(/peer/);
        await client.close();

        expect(await allRuns(engine)).toEqual([]);
    });

    it('starts the role through dispatchPeer, without an http subscription', async () => {
        const { app, engine } = setup();
        const response = await call(app, 'POST', '/agents/worker/runs', { token: DEV_TOKEN, body: peerBody() });

        expect(response.status).toBe(202);

        const { runId, deduplicated } = await response.json() as { runId: string; deduplicated: boolean };

        expect(deduplicated).toBe(false);

        const run = await engine.runService.findOneOrFail(runId);

        expect(run.trigger).toMatchObject({
            channel: 'agent',
            trigger: 'review',
            payload: 'hi',
            invoker: { kind: 'token', id: 'peer-dev' },
            parent: {
                kind: 'peer',
                peer: 'dev',
                runId: 'caller-run-1',
                standIn: 'stand-in-1',
                agent: 'caller',
                role: 'review',
                depth: 1,
                origin: 'Ann',
            },
        });
        expect(run.taint?.source).toBe('peer:dev');
        expect(run.parentRunId).toBeUndefined();

        const again = await call(app, 'POST', '/agents/worker/runs', { token: DEV_TOKEN, body: peerBody() });

        expect(await again.json()).toEqual({ runId, deduplicated: true });
    });

    it('reads the idempotency key from the header', async () => {
        const { app } = setup();
        const body = peerBody({ idempotencyKey: undefined });
        const first = await call(app, 'POST', '/agents/worker/runs', {
            token: DEV_TOKEN, 
            body, 
            headers: { 'idempotency-key': 'h-1' }, 
        });
        const second = await call(app, 'POST', '/agents/worker/runs', {
            token: DEV_TOKEN, 
            body, 
            headers: { 'idempotency-key': 'h-1' }, 
        });

        expect(first.status).toBe(202);
        expect((await second.json()).deduplicated).toBe(true);
    });

    it('answers an unknown and an ungranted agent with the missing-agent 404', async () => {
        const { app, engine } = setup();
        const missing = await call(app, 'POST', '/agents/nope/runs', { token: DEV_TOKEN, body: peerBody() });
        const ungranted = await call(app, 'POST', '/agents/worker/runs', { token: OPS_TOKEN, body: peerBody() });

        expect(missing.status).toBe(404);
        expect(await missing.json()).toEqual({
            status: 404, 
            code: 'not_found', 
            message: 'Agent "nope" was not found.', 
        });
        expect(ungranted.status).toBe(404);
        expect(await ungranted.json()).toEqual({
            status: 404, 
            code: 'not_found', 
            message: 'Agent "worker" was not found.', 
        });

        // the grant is checked before the body: a malformed body to a held agent reads like a missing agent
        const malformed = await call(app, 'POST', '/agents/worker/runs', { token: OPS_TOKEN, body: peerBody({ role: 'Not A Role' }) });
        const malformedMissing = await call(app, 'POST', '/agents/nope/runs', { token: OPS_TOKEN, body: peerBody({ role: 'Not A Role' }) });

        expect(malformed.status).toBe(404);
        expect(await malformed.json()).toEqual({
            status: 404,
            code: 'not_found',
            message: 'Agent "worker" was not found.',
        });
        expect(malformedMissing.status).toBe(404);
        expect(await allRuns(engine)).toEqual([]);
    });

    it('refuses malformed peer fields and a refused dispatch with 400', async () => {
        const { app, engine } = setup();
        const parent = {
            runId: 'caller-run-1', 
            agent: 'caller', 
            depth: 0, 
        };
        const bodies = [
            peerBody({ role: 'Not A Role' }),
            peerBody({ role: undefined }),
            peerBody({ peer: { parent, taint: false } }),
            peerBody({
                peer: {
                    standIn: 's', 
                    parent: { ...parent, depth: 9 }, 
                    taint: false, 
                }, 
            }),
            peerBody({
                peer: {
                    standIn: 's', 
                    parent: { ...parent, depth: 1.5 }, 
                    taint: false, 
                }, 
            }),
            peerBody({
                peer: {
                    standIn: 's', 
                    parent: { ...parent, agent: 'Bad/Agent' }, 
                    taint: false, 
                }, 
            }),
            peerBody({
                peer: {
                    standIn: 's', 
                    parent: { ...parent, runId: '' }, 
                    taint: false, 
                }, 
            }),
            peerBody({
                peer: {
                    standIn: 's', 
                    parent, 
                    taint: 'yes', 
                }, 
            }),
            peerBody({
                peer: {
                    standIn: 's', 
                    parent, 
                    taint: false, 
                    origin: 'x'.repeat(129), 
                }, 
            }),
            // core's checks: no role `other`, `from` lacks `dev/stranger`, no idempotency key
            peerBody({ role: 'other' }),
            peerBody({
                peer: {
                    standIn: 's', 
                    parent: { ...parent, agent: 'stranger' }, 
                    taint: false, 
                }, 
            }),
            peerBody({ idempotencyKey: undefined }),
        ];

        for (const body of bodies) {
            const response = await call(app, 'POST', '/agents/worker/runs', { token: DEV_TOKEN, body });

            expect(response.status, JSON.stringify(body)).toBe(400);
        }

        expect(await allRuns(engine)).toEqual([]);
    });

    it('answers 503 with Retry-After while another replica counts the call', async () => {
        const {
            app, 
            engine, 
            errors, 
        } = setup();

        expect(await engine.lockService.acquire('peer-count-lock:dev:caller-run-1:worker:review', 'other-replica', 60_000)).toBeTypeOf('number');

        const response = await call(app, 'POST', '/agents/worker/runs', { token: DEV_TOKEN, body: peerBody() });

        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('1');
        expect((await response.json()).code).toBe('peer_start_busy');
        expect(errors).toEqual([]);
        expect(await allRuns(engine)).toEqual([]);
    });

    it('answers another InvalidRunStateError of a peer start without the retryable 503', async () => {
        const { app, engine } = setup();

        // a store anomaly: the attachment is neither created nor found under its key
        engine.artifactService.create = async () => false;
        engine.artifactService.findOneByKey = async () => undefined;

        const response = await call(app, 'POST', '/agents/worker/runs', {
            token: DEV_TOKEN,
            body: peerBody({ attachments: [{ mediaType: 'text/plain', data: Buffer.from('hi').toString('base64') }] }),
        });

        expect(response.status).toBe(409);
        expect(response.headers.get('retry-after')).toBeNull();
        expect((await response.json()).code).toBe('invalid_run_state');
    });
});

describe('GET /runs/:id for a peer', () => {
    it('peer reads only own runs', async () => {
        const { app, engine } = setup();
        const gate = await startAsPeer(app, 'gate');
        // started by the peer's token, but through http.on(): no peer parent
        const plain = await call(app, 'POST', '/agents/echo/runs', { token: DEV_TOKEN, body: {} });
        const plainId = (await plain.json() as { runId: string }).runId;
        const foreign = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body: {} });
        const foreignId = (await foreign.json() as { runId: string }).runId;
        const done = await startAsPeer(app, 'worker', DEV_TOKEN, peerBody({ idempotencyKey: 'call-2' }));

        await engine.start();
        await engine.idle();

        const waiting = await engine.runService.findOneOrFail(gate);

        expect(waiting.waiting?.kind).toBe('approval');

        const approvalId = waiting.waiting?.kind === 'approval' ? waiting.waiting.approvalId : '';
        const view = await call(app, 'GET', `/runs/${gate}`, { token: DEV_TOKEN });

        expect(view.status).toBe(200);
        expect(await view.json()).toEqual({
            id: gate,
            status: 'waiting',
            waiting: 'approval',
            approval: {
                runId: gate,
                approvalId,
                title: 'Deploy?',
                url: approvalUrl({ runId: gate, approvalId }),
            },
            tainted: true,
            usage: waiting.usage,
        });

        const completed = await call(app, 'GET', `/runs/${done}`, { token: DEV_TOKEN });

        expect(await completed.json()).toMatchObject({
            id: done, 
            status: 'completed', 
            output: 'worked', 
            tainted: true, 
        });

        const missing = await call(app, 'GET', '/runs/missing', { token: DEV_TOKEN });
        const missingBody = await missing.json();

        expect(missing.status).toBe(404);

        for (const id of [plainId, foreignId]) {
            const response = await call(app, 'GET', `/runs/${id}`, { token: DEV_TOKEN });

            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({ ...missingBody, message: missingBody.message.replace('missing', id) });
        }

        // the run of `dev` is not `ops`'s
        expect((await call(app, 'GET', `/runs/${gate}`, { token: OPS_TOKEN })).status).toBe(404);

        // a non-peer keeps the full run view
        const full = await call(app, 'GET', `/runs/${gate}`, { token: ADMIN_TOKEN });

        expect(await full.json()).toMatchObject({
            id: gate, 
            agent: 'gate', 
            steps: expect.any(Array), 
        });
        await engine.drain();
    });
});

describe('GET /runs/:id usage for a peer', () => {
    it('sums the run\'s usage and its subtree usage', async () => {
        const { app, engine } = setup();
        const own = await startAsPeer(app, 'worker');

        await engine.runService.update(own, {
            usage: { inputTokens: 1, outputTokens: 2 },
            subtreeUsage: { inputTokens: 10, outputTokens: 20 },
        });

        const view = await call(app, 'GET', `/runs/${own}`, { token: DEV_TOKEN });

        expect((await view.json()).usage).toEqual({ inputTokens: 11, outputTokens: 22 });
    });
});

describe('POST /runs/:id/approve by a peer', () => {
    it('answers the unknown-run 404, even with an approve grant', async () => {
        const { app, engine } = setup();
        const gate = await startAsPeer(app, 'gate');

        await engine.start();
        await engine.idle();

        const waiting = await engine.runService.findOneOrFail(gate);
        const approvalId = waiting.waiting?.kind === 'approval' ? waiting.waiting.approvalId : '';
        const missing = await call(app, 'POST', '/runs/missing/approve', { token: DEV_TOKEN, body: { approvalId, approved: true } });
        const missingBody = await missing.json();
        const refused = await call(app, 'POST', `/runs/${gate}/approve`, { token: DEV_TOKEN, body: { approvalId, approved: true } });

        expect(refused.status).toBe(404);
        expect(await refused.json()).toEqual({ ...missingBody, message: missingBody.message.replace('missing', gate) });
        expect((await engine.runService.findOneOrFail(gate)).status).toBe('waiting');
        await engine.drain();
    });
});

describe('POST /runs/:id/cancel by a peer', () => {
    it('cancels its own run without chamvi_run_cancel, any other run is 404', async () => {
        const { app } = setup();
        const own = await startAsPeer(app, 'worker');
        const foreign = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body: {} });
        const foreignId = (await foreign.json() as { runId: string }).runId;
        const response = await call(app, 'POST', `/runs/${own}/cancel`, { token: DEV_TOKEN });

        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ runId: own, status: 'cancelled' });
        expect((await call(app, 'POST', `/runs/${foreignId}/cancel`, { token: DEV_TOKEN })).status).toBe(404);
        expect((await call(app, 'POST', `/runs/${own}/cancel`, { token: OPS_TOKEN })).status).toBe(404);
        expect((await call(app, 'POST', '/runs/missing/cancel', { token: DEV_TOKEN })).status).toBe(404);
    });
});

describe('POST /runs/:id/wake', () => {
    it('wake marks only a stand-in of that peer and answers every peer alike', async () => {
        const {
            app, 
            engine, 
            reads, 
        } = setup();
        const standIn = await seedStandIn(engine, 'dev');
        const own = await startAsPeer(app, 'worker');

        // the first poll, then the window is closed
        await engine.tick();
        await waitFor(() => reads.length === 1);

        const woken = await call(app, 'POST', `/runs/${standIn}/wake`, { token: DEV_TOKEN });

        expect(woken.status).toBe(202);
        expect(await woken.text()).toBe('');

        // the detached tick polls the woken wait inside the window
        await waitFor(() => reads.length === 2);
        expect(reads).toEqual(['remote-1', 'remote-1']);

        // a peer gets 202 for another peer's stand-in, a run that is no stand-in, a missing run: nothing marked, no poll
        expect((await call(app, 'POST', `/runs/${standIn}/wake`, { token: OPS_TOKEN })).status).toBe(202);
        expect((await call(app, 'POST', `/runs/${own}/wake`, { token: DEV_TOKEN })).status).toBe(202);
        expect((await call(app, 'POST', '/runs/missing/wake', { token: DEV_TOKEN })).status).toBe(202);

        // a non-peer: the unknown-run 404
        expect((await call(app, 'POST', `/runs/${standIn}/wake`, { token: ADMIN_TOKEN })).status).toBe(404);

        for (let i = 0; i < 10; i++) {
            await flush();
        }

        expect(reads).toEqual(['remote-1', 'remote-1']);
    });

    it('ticks only for a fresh mark', async () => {
        const {
            app, 
            engine, 
            reads, 
        } = setup();
        const standIn = await seedStandIn(engine, 'dev', true);
        const woken = await call(app, 'POST', `/runs/${standIn}/wake`, { token: DEV_TOKEN });

        expect(woken.status).toBe(202);

        for (let i = 0; i < 10; i++) {
            await flush();
        }

        // the mark was set already: its poll comes with the next regular tick
        expect(reads).toEqual([]);
    });
});

describe('the agent channel', () => {
    it('is reachable through no public route', async () => {
        const { app, engine } = setup();
        const response = await call(app, 'POST', '/agents/echo/runs', { token: ADMIN_TOKEN, body: { channel: 'agent', trigger: 'review' } });
        const { runId } = await response.json() as { runId: string };

        expect((await engine.runService.findOneOrFail(runId)).trigger.channel).toBe('http');

        // a role subscriber without http.on() has no REST start for a non-peer
        expect((await call(app, 'POST', '/agents/worker/runs', { token: ADMIN_TOKEN, body: {} })).status).toBe(404);
        // nor a channel mount
        expect((await call(app, 'POST', '/channels/agent/worker', { token: ADMIN_TOKEN, body: {} })).status).toBe(404);
        expect(await allRuns(engine)).toHaveLength(1);
    });
});

describe('GET /agents of a remote agent', () => {
    it('names the peer and the agent there', () => {
        const developer = defineRemoteAgent({
            name: 'developer',
            peer: 'dev',
            agent: 'coder',
        });

        expect(summarizeAgent(developer, '')).toEqual(expect.objectContaining({
            kind: 'remote',
            remote: { peer: 'dev', agent: 'coder' },
        }));
        expect(summarizeAgent(defineSimpleAgent({ name: 'fan', run: () => 'ok' }), '')).not.toHaveProperty('remote');
    });
});
