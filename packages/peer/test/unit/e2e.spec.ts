/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { setImmediate as yieldToIo } from 'node:timers/promises';
import {
    afterEach,
    describe,
    expect,
    it,
} from 'vitest';
import { z } from 'zod';
import {
    agent,
    approve,
    defineRemoteAgent,
    defineSimpleAgent,
    defineTool,
    dispatchTo,
    waitForDispatch,
} from '@chamvi/core';
import type {
    Agent,
    ChannelMessage,
    IChannel,
    IEngine,
} from '@chamvi/core';
import type { Run } from '@chamvi/store';
import { ControllableClock } from '@chamvi/test-kit';
import {
    AppToken,
    ModuleName,
    Permission,
    configModule,
    createApp,
    createLogger,
} from '@chamvi/app';
import type { IApp, IContainer, IModule } from '@chamvi/app';
import { memoryStoreModule } from '@chamvi/app/testing';
import { peerModule } from '@chamvi/peer/module';
import { freePort } from '../utils/port.ts';

const NOW = new Date('2026-11-19T08:00:00Z');
/** The engine's poll interval: claimTtlMs (60 s) / 3. */
const TICK_MS = 20_000;
/** Each peer's poll window (three ticks). */
const POLL_MS = 60_000;

const DEV_ADMIN = 'dev-admin-token-0123456789';
const ASSISTANTS_ADMIN = 'assistants-admin-token-0123456789';
/** The bearer assistants sends to dev: the static token `peer-assistants` of dev. */
const ASSISTANTS_AT_DEV = 'assistants-at-dev-token-0123456789';
/** The bearer dev sends to assistants: the static token `peer-dev` of assistants. */
const DEV_AT_ASSISTANTS = 'dev-at-assistants-token-0123456789';

type Sent = { message: ChannelMessage; address: string };

type Side = {
    app: IApp;
    engine: IEngine;
    url: string;
    /** The wake requests this app sent (or dropped) to its peer, by URL. */
    wakes: string[];
    /** Every log line at level error. */
    errors: string[];
};

type Pair = {
    clock: ControllableClock;
    dev: Side & { github: Sent[] };
    assistants: Side & { chat: Sent[]; delivered: string[] };
    /** Drops every wake dev sends to assistants (a lost ping). */
    dropWakes: { value: boolean };
};

let apps: IApp[] = [];

afterEach(async () => {
    await Promise.all(apps.map((app) => app.stop().catch(() => {})));
    apps = [];
});

function recordingChannel(name: string): { channel: IChannel; sent: Sent[] } {
    const sent: Sent[] = [];

    return {
        sent,
        channel: {
            name,
            out: async (message, address) => {
                sent.push({ message, address });
            },
        },
    };
}

/** Contributes `channels` and hands the engine to `onEngine` once it exists. */
function harnessModule(channels: IChannel[], onEngine: (engine: IEngine) => void): IModule {
    return {
        name: 'e2e',
        dependencies: [ModuleName.CONFIG],
        setup(container: IContainer) {
            for (const channel of channels) {
                container.registerMany(AppToken.CHANNELS, { useValue: channel });
            }

            container.registerMany(AppToken.LIFECYCLE_HOOKS, { useValue: { name: 'e2e', engineCreated: onEngine } });

            return Promise.resolve();
        },
    };
}

/** A fetch that records wake URLs, and drops them while `drop.value` is set (answering 202, as a lost ping looks). */
function wakeFetch(wakes: string[], drop: { value: boolean }): typeof fetch {
    return async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);

        if (url.endsWith('/wake')) {
            wakes.push(url);

            if (drop.value) {
                return new Response(null, { status: 202 });
            }
        }

        return fetch(input, init);
    };
}

function runOnly(agentName: string) {
    return {
        permission: { name: Permission.AGENT_RUN },
        policies: [{ type: 'attributes', query: { name: agentName } }],
    };
}

function tokensOf(entries: Array<{
    value: string;
    id: string;
    permissions: unknown
}>): string {
    return JSON.stringify(entries);
}

async function startSide(options: {
    clock: ControllableClock;
    port: number;
    agents: Agent[];
    channels: IChannel[];
    tokens: string;
    peer: Parameters<typeof peerModule>[0];
}): Promise<Side> {
    const errors: string[] = [];
    let engine: IEngine | undefined;
    const logger = createLogger({
        clock: options.clock,
        write: (line) => {
            if (line.includes('"level":"error"')) {
                errors.push(line);
            }
        },
    });
    const url = `http://127.0.0.1:${options.port}`;
    const app = createApp({
        agents: options.agents,
        modules: [
            configModule({ clock: options.clock, logger }),
            memoryStoreModule(),
            peerModule(options.peer),
            harnessModule(options.channels, (created) => {
                engine = created;
            }),
        ],
    });

    apps.push(app);

    await app.start({
        env: {
            HOST: '127.0.0.1',
            PORT: String(options.port),
            PUBLIC_URL: url,
            TOKENS: options.tokens,
        },
    });

    if (!engine) {
        throw new Error('The engine was not created.');
    }

    return {
        app,
        engine,
        url,
        wakes: [],
        errors,
    };
}

/**
 * Two apps over real HTTP on loopback ports, one memory store each, one
 * clock: `assistants` (alfred, the remote `developer`, `notify`,
 * `restricted`, a chat channel) and `dev` (`developer`, `maintainer`, the
 * remote `notify` and `restricted`, a GitHub-like channel). Each knows the
 * other as a peer with a static token that may run only the agents the
 * other side calls.
 */
async function startPair(): Promise<Pair> {
    const clock = new ControllableClock(NOW);
    const devPort = await freePort();
    let assistantsPort = await freePort();

    // freePort() closes its listener, so the next call may hand out the same port again
    while (assistantsPort === devPort) {
        assistantsPort = await freePort();
    }

    const devUrl = `http://127.0.0.1:${devPort}`;
    const assistantsUrl = `http://127.0.0.1:${assistantsPort}`;
    const dropWakes = { value: false };
    const devWakes: string[] = [];
    const assistantsWakes: string[] = [];
    const delivered: string[] = [];

    const chat = recordingChannel('chat');
    const github = recordingChannel('github');

    const assistantsAgents: Agent[] = [
        defineSimpleAgent({
            name: 'alfred',
            channels: [{
                channel: 'chat',
                id: 'chat',
                options: {},
            }],
            run: async (payload, ctx) => waitForDispatch(ctx, await dispatchTo(ctx, { agent: 'developer', payload })),
        }),
        defineRemoteAgent({
            name: 'developer',
            peer: 'dev',
            channels: [agent.on({ from: ['alfred'] })],
            approvals: { channel: 'chat', address: 'owner' },
        }),
        defineSimpleAgent({
            name: 'notify',
            channels: [agent.on({ from: ['dev/maintainer'] })],
            tools: {
                send_message: defineTool({
                    description: 'Messages the owner.',
                    inputSchema: z.object({ text: z.string() }),
                    trust: { guardWhenTainted: true },
                    execute: async ({ text }) => {
                        delivered.push(text);

                        return { sent: true };
                    },
                }),
            },
            run: async (payload, ctx) => ctx.tools.send_message!({ text: (payload as { text: string }).text }),
        }),
        defineSimpleAgent({
            name: 'restricted',
            channels: [agent.on({ from: ['other/maintainer'] })],
            run: async () => 'reached',
        }),
    ];

    const devAgents: Agent[] = [
        defineSimpleAgent({
            name: 'developer',
            // the default maxDepth (1): a stand-in adds no level, so alfred's call lands at depth 1
            channels: [agent.on({ from: ['assistants/alfred'] })],
            tools: {
                read_changelog: defineTool({
                    description: 'Reads an upstream changelog (untrusted content).',
                    inputSchema: z.object({}),
                    trust: { taint: true },
                    execute: async () => 'changelog',
                }),
            },
            run: async (payload, ctx) => {
                await ctx.tools.read_changelog!({});

                const decision = await approve(ctx, { title: 'Upgrade the dependencies?' });

                return { upgraded: decision.approved, task: payload };
            },
        }),
        defineSimpleAgent({
            name: 'maintainer',
            channels: [{
                channel: 'github',
                id: 'github',
                options: {},
            }],
            tools: {
                read_issue: defineTool({
                    description: 'Reads an issue (untrusted content).',
                    inputSchema: z.object({}),
                    trust: { taint: true },
                    execute: async () => 'issue text',
                }),
            },
            run: async (payload, ctx) => {
                const { target, text } = payload as { target: string; text: string };

                await ctx.tools.read_issue!({});

                return waitForDispatch(ctx, await dispatchTo(ctx, { agent: target, payload: { text } }));
            },
        }),
        defineRemoteAgent({
            name: 'notify',
            peer: 'assistants',
            channels: [agent.on({ from: ['maintainer'] })],
        }),
        defineRemoteAgent({
            name: 'restricted',
            peer: 'assistants',
            channels: [agent.on({ from: ['maintainer'] })],
        }),
    ];

    const dev = await startSide({
        clock,
        port: devPort,
        agents: devAgents,
        channels: [github.channel],
        tokens: tokensOf([
            {
                value: DEV_ADMIN,
                id: 'admin',
                permissions: '*',
            },
            {
                value: ASSISTANTS_AT_DEV,
                id: 'peer-assistants',
                permissions: [runOnly('developer')],
            },
        ]),
        peer: {
            peers: {
                assistants: {
                    url: assistantsUrl,
                    outgoing: { token: DEV_AT_ASSISTANTS },
                    incoming: { token: 'peer-assistants' },
                    pollMs: POLL_MS,
                },
            },
            fetch: wakeFetch(devWakes, dropWakes),
        },
    });
    const assistants = await startSide({
        clock,
        port: assistantsPort,
        agents: assistantsAgents,
        channels: [chat.channel],
        tokens: tokensOf([
            {
                value: ASSISTANTS_ADMIN,
                id: 'admin',
                permissions: '*',
            },
            {
                value: DEV_AT_ASSISTANTS,
                id: 'peer-dev',
                permissions: [runOnly('notify'), runOnly('restricted')],
            },
        ]),
        peer: {
            peers: {
                dev: {
                    url: devUrl,
                    outgoing: { token: ASSISTANTS_AT_DEV },
                    incoming: { token: 'peer-dev' },
                    pollMs: POLL_MS,
                    approvals: { channel: 'chat', address: 'owner' },
                },
            },
            fetch: wakeFetch(assistantsWakes, { value: false }),
        },
    });

    return {
        clock,
        dropWakes,
        dev: {
            ...dev,
            wakes: devWakes,
            github: github.sent,
        },
        assistants: {
            ...assistants,
            wakes: assistantsWakes,
            chat: chat.sent,
            delivered,
        },
    };
}

/** One round: both engines idle (their HTTP calls answered), then the event loop gets the sockets' I/O. */
async function settleRound(pair: Pair): Promise<void> {
    await pair.dev.engine.idle();
    await pair.assistants.engine.idle();
    await yieldToIo();
}

/** Rounds until `condition` holds (bounded); the condition's last value. */
async function until(pair: Pair, condition: () => Promise<boolean>, rounds = 200): Promise<boolean> {
    for (let round = 0; round < rounds; round++) {
        if (await condition()) {
            return true;
        }

        await settleRound(pair);
    }

    return condition();
}

/** A fixed number of rounds, for asserting that something did not happen. */
async function quiesce(pair: Pair, rounds = 30): Promise<void> {
    for (let round = 0; round < rounds; round++) {
        await settleRound(pair);
    }
}

/** Advances the shared clock by one engine tick, then lets both apps finish what the tick started. */
async function advanceTick(pair: Pair): Promise<void> {
    pair.clock.advance(TICK_MS);
    await quiesce(pair, 10);
}

async function runOf(side: Side, runId: string): Promise<Run | undefined> {
    return side.engine.runService.findOne(runId);
}

async function runsOf(side: Side, agentName: string): Promise<Run[]> {
    const { data } = await side.engine.runService.find({ agent: agentName });

    return data;
}

async function statusIs(side: Side, runId: string, status: string): Promise<boolean> {
    return (await runOf(side, runId))?.status === status;
}

async function onlyRunOf(pair: Pair, side: Side, agentName: string): Promise<Run> {
    expect(await until(pair, async () => (await runsOf(side, agentName)).length > 0)).toBe(true);

    const runs = await runsOf(side, agentName);

    expect(runs).toHaveLength(1);

    return runs[0]!;
}

async function approveAt(side: Side, token: string, runId: string, approvalId: string): Promise<Response> {
    return fetch(`${side.url}/runs/${runId}/approve`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ approvalId, approved: true }),
    });
}

function approvalIdOf(run: Run | undefined): string {
    if (run?.waiting?.kind !== 'approval') {
        throw new Error(`Run ${run?.id} does not wait on an approval.`);
    }

    return run.waiting.approvalId;
}

/** The chat thread alfred is started from: never the remote agent's fixed `approvals` address (`owner`). */
const ALFRED_THREAD = 'thread-1';

/** Starts alfred from the chat; resolves the alfred run, the stand-in and dev's developer run once it waits on its approval. */
async function startAlfred(pair: Pair) {
    const { runId } = await pair.assistants.engine.dispatch({
        agent: 'alfred',
        trigger: 'chat',
        channel: 'chat',
        address: ALFRED_THREAD,
        payload: { task: 'upgrade the dependencies' },
    });
    const standIn = await onlyRunOf(pair, pair.assistants, 'developer');
    const developer = await onlyRunOf(pair, pair.dev, 'developer');

    expect(await until(pair, () => statusIs(pair.dev, developer.id, 'waiting'))).toBe(true);

    return {
        alfred: runId,
        standIn: standIn.id,
        developer: developer.id,
    };
}

describe('two apps end to end', () => {
    it('assistants -> dev: alfred waits on dev\'s developer, its approval reaches the chat, answering at dev completes both', async () => {
        const pair = await startPair();
        const {
            alfred,
            standIn,
            developer,
        } = await startAlfred(pair);
        const approvalId = approvalIdOf(await runOf(pair.dev, developer));

        // the wake of the pause makes assistants poll at once: one chat message with dev's approval link
        expect(await until(pair, async () => pair.assistants.chat.length > 0)).toBe(true);
        await quiesce(pair);

        expect(pair.assistants.chat).toHaveLength(1);

        const [notice] = pair.assistants.chat;
        const link = `${pair.dev.url}/ui/approvals?run=${encodeURIComponent(developer)}&approval=${encodeURIComponent(approvalId)}`;

        // only the fixed destination: alfred's own chat thread (the stand-in's ancestor source) gets nothing
        expect(notice!.address).toBe('owner');
        expect(pair.assistants.chat.filter((sent) => sent.address === ALFRED_THREAD)).toEqual([]);
        expect(notice!.message).toMatchObject({ kind: 'message', title: 'Upgrade the dependencies?' });
        expect(notice!.message.body).toContain(link);

        const waiting = (await runOf(pair.assistants, standIn))?.waiting;

        expect(waiting).toMatchObject({
            kind: 'remote',
            peer: 'dev',
            remoteRunId: developer,
        });

        // the caller cannot answer: the approval is dev's
        expect((await approveAt(pair.assistants, ASSISTANTS_ADMIN, standIn, approvalId)).status).toBe(409);

        expect((await approveAt(pair.dev, DEV_ADMIN, developer, approvalId)).status).toBe(202);

        expect(await until(pair, () => statusIs(pair.assistants, alfred, 'completed'))).toBe(true);

        const output = { upgraded: true, task: { task: 'upgrade the dependencies' } };

        expect(await runOf(pair.dev, developer)).toMatchObject({ status: 'completed', output });
        expect(await runOf(pair.assistants, standIn)).toMatchObject({ status: 'completed', output });
        expect(pair.assistants.chat).toHaveLength(1);
        expect((await runOf(pair.assistants, alfred))?.output).toMatchObject({
            runId: standIn,
            agent: 'developer',
            status: 'completed',
            output,
        });

        // taint comes back: dev's run read untrusted content, so the stand-in and alfred are tainted
        expect((await runOf(pair.dev, developer))?.taint?.source).toBe('tool:read_changelog');
        expect((await runOf(pair.assistants, standIn))?.taint?.source).toBe(`peer:dev/${developer}`);
        expect((await runOf(pair.assistants, alfred))?.taint?.source).toBe(`dispatch:${standIn}`);

        // dev's run acts as the peer, with lineage naming the caller
        expect((await runOf(pair.dev, developer))?.trigger).toMatchObject({
            invoker: { kind: 'token', id: 'peer-assistants' },
            parent: {
                kind: 'peer',
                peer: 'assistants',
                standIn,
                runId: alfred,
                agent: 'alfred',
                depth: 1,
            },
        });
        expect(pair.dev.wakes.length).toBeGreaterThan(0);
        expect(pair.dev.errors).toEqual([]);
        expect(pair.assistants.errors).toEqual([]);
    });

    it('dev -> assistants: a tainted maintainer starts a tainted notify run, its guarded tool asks the owner through assistants\' peer destination only', async () => {
        const pair = await startPair();
        const { runId: maintainer } = await pair.dev.engine.dispatch({
            agent: 'maintainer',
            trigger: 'github',
            channel: 'github',
            address: 'chamvi/chamvi#1',
            payload: { target: 'notify', text: 'Released 0.10.0.' },
        });
        const standIn = await onlyRunOf(pair, pair.dev, 'notify');
        const notify = await onlyRunOf(pair, pair.assistants, 'notify');

        expect(await until(pair, () => statusIs(pair.assistants, notify.id, 'waiting'))).toBe(true);

        const remote = await runOf(pair.assistants, notify.id);

        // tainted from the start, by the peer
        expect(remote?.taint?.source).toBe('peer:dev');
        expect(remote?.trigger.parent).toMatchObject({
            kind: 'peer',
            agent: 'maintainer',
            depth: 1,
        });
        expect(remote?.waiting).toMatchObject({ kind: 'approval', toolName: 'send_message' });
        expect(pair.assistants.delivered).toEqual([]);

        // assistants' per-peer destination gets the notification, with assistants' own link
        expect(await until(pair, async () => pair.assistants.chat.length > 0)).toBe(true);
        await quiesce(pair);

        const approvalId = approvalIdOf(remote);

        expect(pair.assistants.chat).toHaveLength(1);
        expect(pair.assistants.chat[0]!.address).toBe('owner');
        expect(pair.assistants.chat[0]!.message.body)
            .toContain(`${pair.assistants.url}/ui/approvals?run=${encodeURIComponent(notify.id)}&approval=${encodeURIComponent(approvalId)}`);

        // dev's stand-in saw the remote approval (the pause wake reached dev and it polled), so a
        // fallback to the maintainer's source would have posted by now
        expect(pair.assistants.wakes).toContain(`${pair.dev.url}/runs/${standIn.id}/wake`);
        expect(await until(pair, async () => {
            const waiting = (await runOf(pair.dev, standIn.id))?.waiting;

            return waiting?.kind === 'remote' && waiting.remote?.approval !== undefined;
        })).toBe(true);
        expect((await runOf(pair.dev, standIn.id))?.waiting).toMatchObject({
            kind: 'remote',
            remote: { approval: { runId: notify.id, approvalId } },
        });
        await quiesce(pair);

        // the source of the maintainer run (a public thread) gets nothing
        expect(pair.dev.github).toEqual([]);

        expect((await approveAt(pair.assistants, ASSISTANTS_ADMIN, notify.id, approvalId)).status).toBe(202);
        expect(await until(pair, () => statusIs(pair.dev, maintainer, 'completed'))).toBe(true);

        expect(pair.assistants.delivered).toEqual(['Released 0.10.0.']);

        // the stand-in inherited the maintainer's first exposure; the tainted remote result keeps it tainted
        expect((await runOf(pair.dev, standIn.id))?.taint?.source).toBe('tool:read_issue');
        expect((await runOf(pair.dev, maintainer))?.output).toMatchObject({ status: 'completed', output: { sent: true } });
        expect(pair.dev.github).toEqual([]);
        expect(pair.dev.errors).toEqual([]);
        expect(pair.assistants.errors).toEqual([]);
    });

    it('a lost ping: the caller settles within one poll window', async () => {
        const pair = await startPair();

        pair.dropWakes.value = true;

        const {
            alfred,
            standIn,
            developer,
        } = await startAlfred(pair);

        // the pause wake was lost: nothing has polled the remote run yet
        await quiesce(pair);
        expect((await runOf(pair.assistants, standIn))?.waiting).toMatchObject({ kind: 'remote' });
        expect((await runOf(pair.assistants, standIn))?.waiting).not.toHaveProperty('remote');

        // the first tick polls and takes the window
        await advanceTick(pair);

        expect((await runOf(pair.assistants, standIn))?.waiting).toMatchObject({
            kind: 'remote',
            remote: { approval: { runId: developer } },
        });

        const answeredAt = pair.clock.now();

        expect((await approveAt(pair.dev, DEV_ADMIN, developer, approvalIdOf(await runOf(pair.dev, developer)))).status).toBe(202);
        expect(await until(pair, () => statusIs(pair.dev, developer, 'completed'))).toBe(true);
        await quiesce(pair);

        // the settle wake was sent and lost: the window is still closed
        expect(pair.dev.wakes.length).toBeGreaterThanOrEqual(2);
        expect((await runOf(pair.assistants, standIn))?.status).toBe('waiting');

        while (pair.clock.now() - answeredAt < POLL_MS && !await statusIs(pair.assistants, alfred, 'completed')) {
            await advanceTick(pair);
        }

        expect(await until(pair, () => statusIs(pair.assistants, alfred, 'completed'))).toBe(true);
        expect(pair.clock.now() - answeredAt).toBeLessThanOrEqual(POLL_MS);
        expect(await runOf(pair.assistants, standIn)).toMatchObject({ status: 'completed', output: { upgraded: true } });
        expect(pair.dev.errors).toEqual([]);
        expect(pair.assistants.errors).toEqual([]);
    });

    it('a wrong peer: a role open only to another peer fails the stand-in with validation_error', async () => {
        const pair = await startPair();
        const { runId: maintainer } = await pair.dev.engine.dispatch({
            agent: 'maintainer',
            trigger: 'github',
            channel: 'github',
            address: 'chamvi/chamvi#2',
            payload: { target: 'restricted', text: 'hi' },
        });
        const standIn = await onlyRunOf(pair, pair.dev, 'restricted');

        expect(await until(pair, () => statusIs(pair.dev, maintainer, 'completed'))).toBe(true);

        const failed = await runOf(pair.dev, standIn.id);

        expect(failed?.status).toBe('failed');
        expect(failed?.error?.code).toBe('validation_error');
        // refused by `from` (dev's token may run the agent): the peer name came from the credential
        expect(failed?.error?.message).toContain('accepts no dispatches from "dev/maintainer"');
        expect((await runOf(pair.dev, maintainer))?.output).toMatchObject({
            status: 'failed',
            error: { code: 'validation_error' },
        });
        expect(await runsOf(pair.assistants, 'restricted')).toEqual([]);
        expect(pair.dev.errors).toEqual([]);
        expect(pair.assistants.errors).toEqual([]);
    });
});
