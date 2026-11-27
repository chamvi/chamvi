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
import { agentChannel, findApprovalWaitBelow, pendingApprovalOf } from '@chamvi/core';
import type { 
    ChannelMessage, 
    ChannelSendOptions, 
    IChannel, 
    IEngine, 
} from '@chamvi/core';
import { RunStatus } from '@chamvi/core-kit';
import type { PeerRunView, Run } from '@chamvi/core-kit';
import { peerRunView } from '../../utils/peers.ts';
import {
    REMOTE_START,
    readRun,
    setupRemote,
    startStandIn,
} from '../../utils/remote.ts';

const POLL_MS = 60_000;
const URL = 'https://dev/ui/approvals?run=r1&approval=0:c1:0';

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((e) => e.stop()));

    engines.length = 0;
});

type Sent = {
    message: ChannelMessage;
    address: string;
    options: ChannelSendOptions;
};

/**
 * A fake chat channel recording every `out`; `fail` makes the next sends
 * reject, `gate` holds a send until it resolves (`started` counts the calls).
 */
function chatChannel() {
    const sent: Sent[] = [];
    const state: {
        fail: number; 
        started: number; 
        gate?: Promise<void>;
        /** Called when a send starts, before the gate. */
        entered?: () => void;
    } = { fail: 0, started: 0 };
    const channel: IChannel = {
        name: 'chat',
        out: async (message, address, options) => {
            state.started++;
            state.entered?.();

            if (state.gate) {
                await state.gate;
            }

            if (state.fail > 0) {
                state.fail--;

                throw new Error('chat down');
            }

            sent.push({
                message,
                address,
                options,
            });
        },
    };

    return {
        channel,
        sent,
        state,
    };
}

function setup(approvals: { channel: string; address: string } | null = { channel: 'chat', address: 'owner' }) {
    const chat = chatChannel();
    const ctx = setupRemote({
        peers: { dev: {} },
        developer: approvals ? { approvals } : {},
        engine: { claimTtlMs: 3_600_000, channels: [agentChannel(), chat.channel] },
    });

    engines.push(ctx.engine);

    return { ...ctx, chat };
}

async function tickIdle(engine: IEngine): Promise<void> {
    await engine.tick();
    await engine.idle();
}

function waitingView(runId: string, approval?: PeerRunView['approval']): PeerRunView {
    return peerRunView(runId, {
        status: 'waiting',
        waiting: approval ? 'approval' : 'dispatch',
        ...(approval ? { approval } : {}),
    });
}

const PUSH = {
    runId: 'r1',
    approvalId: '0:c1:0',
    title: 'Push?',
    url: URL,
};

describe('the stand-in run: remote approvals', () => {
    it('stores a remote approval and notifies the fixed destination once per approval id', async () => {
        const {
            engine,
            store,
            clock,
            peers,
            chat,
        } = setup();

        peers.script('start', { runId: 'r1' });
        peers.script(
            'read',
            waitingView('r1', PUSH),
            waitingView('r1', PUSH),
            waitingView('r1', {
                ...PUSH, 
                approvalId: '1:c2:0', 
                title: 'Deploy?', 
            }),
        );

        const runId = await startStandIn(engine);

        await tickIdle(engine);

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.WAITING);
        expect(run.waiting).toMatchObject({
            kind: 'remote',
            remote: {
                status: 'waiting',
                approval: { ...PUSH, notifiedAt: new Date(REMOTE_START) },
            },
        });
        expect(chat.sent).toHaveLength(1);
        expect(chat.sent[0]!.address).toBe('owner');
        expect(chat.sent[0]!.message).toMatchObject({
            kind: 'message',
            key: `${runId}:remote:r1:0:c1:0`,
            runId,
            agent: 'developer',
            title: 'Push?',
        });
        expect(chat.sent[0]!.message.body).toContain(URL);
        expect(chat.sent[0]!.message).not.toHaveProperty('approvalId');

        clock.advance(POLL_MS);
        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(2);
        expect(chat.sent).toHaveLength(1);

        clock.advance(POLL_MS);
        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(3);
        expect(chat.sent).toHaveLength(2);
        expect(chat.sent[1]!.message).toMatchObject({
            kind: 'message',
            key: `${runId}:remote:r1:1:c2:0`,
            title: 'Deploy?',
        });

        // the stand-in never enters the local approvals inbox
        expect((await store.runService.find({ waitKind: 'approval' })).total).toBe(0);
    });

    it('sends nothing without an approvals destination', async () => {
        const {
            engine,
            store,
            peers,
            chat,
            errors,
        } = setup(null);

        peers.script('start', { runId: 'r1' });
        peers.script('read', waitingView('r1', PUSH));

        const runId = await startStandIn(engine);

        await tickIdle(engine);
        await tickIdle(engine);

        const run = await readRun(store, runId);

        expect(run.waiting).toMatchObject({ kind: 'remote', remote: { status: 'waiting', approval: PUSH } });
        expect(run.waiting?.kind === 'remote' ? run.waiting.remote?.approval : undefined).not.toHaveProperty('notifiedAt');
        expect(chat.sent).toHaveLength(0);
        expect(errors).toEqual([]);
    });

    it('says the approval waits in the peer\'s dashboard without a url', async () => {
        const {
            engine,
            peers,
            chat,
        } = setup();
        const withoutUrl = {
            runId: PUSH.runId,
            approvalId: PUSH.approvalId,
            title: PUSH.title,
        };

        peers.script('start', { runId: 'r1' });
        peers.script('read', waitingView('r1', withoutUrl));

        await startStandIn(engine);
        await tickIdle(engine);

        expect(chat.sent).toHaveLength(1);
        expect(chat.sent[0]!.message.body).toMatch(/dashboard/);
        expect(chat.sent[0]!.message.body).not.toMatch(/https?:/);
    });

    it('sends one notification per key across two engines on one store', async () => {
        const {
            engine,
            store,
            peers,
            chat,
            replica,
        } = setup();
        const other = replica();
        const gate = Promise.withResolvers<void>();
        const entered = Promise.withResolvers<void>();

        engines.push(other);
        chat.state.gate = gate.promise;
        chat.state.entered = entered.resolve;
        peers.script('start', { runId: 'r1' });
        peers.script('read', waitingView('r1', PUSH));

        const runId = await startStandIn(engine);

        try {
            // A polls, stores the approval and is inside `out` (bounded by the test timeout, no timer of its own)
            await engine.tick();
            await entered.promise;

            // B (and A's own retry) see the approval not yet notified: the notify lock is held
            await other.tick();
            await engine.tick();
            await other.idle();

            expect(chat.state.started).toBe(1);
        } finally {
            gate.resolve();
        }

        await Promise.all([engine.idle(), other.idle()]);
        await tickIdle(other);
        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(1);
        expect(chat.state.started).toBe(1);
        expect(chat.sent.map((item) => item.message.key)).toEqual([`${runId}:remote:r1:0:c1:0`]);

        const run = await readRun(store, runId);

        expect(run.waiting?.kind === 'remote' ? run.waiting.remote?.approval?.notifiedAt : undefined).toBeInstanceOf(Date);
    });

    it('retries a failed notification on the next tick without a new read', async () => {
        const {
            engine,
            peers,
            chat,
            errors,
        } = setup();

        chat.state.fail = 1;
        peers.script('start', { runId: 'r1' });
        peers.script('read', waitingView('r1', PUSH));

        await startStandIn(engine);
        await tickIdle(engine);

        expect(chat.sent).toHaveLength(0);
        expect(errors).toHaveLength(1);

        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(1);
        expect(chat.sent).toHaveLength(1);

        await tickIdle(engine);

        expect(chat.sent).toHaveLength(1);
    });

    it('clears the approval once the remote run no longer shows one', async () => {
        const {
            engine,
            store,
            clock,
            peers,
        } = setup(null);

        peers.script('start', { runId: 'r1' });
        peers.script('read', waitingView('r1', PUSH), peerRunView('r1'));

        const runId = await startStandIn(engine);

        await tickIdle(engine);
        clock.advance(POLL_MS);
        await tickIdle(engine);

        const run = await readRun(store, runId);

        expect(run.waiting).toMatchObject({ kind: 'remote', remote: { status: 'running' } });
        expect(run.waiting?.kind === 'remote' ? run.waiting.remote : undefined).not.toHaveProperty('approval');
    });

    it('keeps a wake requested while the poll read the remote run', async () => {
        const {
            engine,
            store,
            peers,
        } = setup(null);

        peers.recognize = (invoker) => (invoker?.id === 'dev-token' ? 'dev' : undefined);
        peers.script('start', { runId: 'r1' });

        const runId = await startStandIn(engine);

        peers.script('read', async () => {
            await engine.wake(runId, {
                kind: 'token', 
                id: 'dev-token', 
                bindings: [], 
            });

            return waitingView('r1', PUSH);
        });

        await tickIdle(engine);

        const run = await readRun(store, runId);

        expect(run.waiting).toMatchObject({
            kind: 'remote',
            wakeRequested: true,
            remote: { approval: PUSH },
        });
    });

    it('finds a stand-in holding a remote approval below its caller', async () => {
        const {
            engine,
            store,
            peers,
        } = setup();

        peers.script('start', { runId: 'r1' });
        peers.script('read', waitingView('r1', PUSH));

        await engine.start();

        const { runId: alfred } = await engine.dispatch({
            agent: 'alfred',
            trigger: 'test',
            channel: 'test',
            payload: { task: 'upgrade' },
        });

        await engine.idle();
        await tickIdle(engine);

        // alfred dispatched developer without waiting: its stand-in child still holds the approval
        const caller = await readRun(store, alfred);

        const holder = await findApprovalWaitBelow(store.runService, caller);

        expect(holder?.agent).toBe('developer');
        expect(pendingApprovalOf(holder!)).toEqual(PUSH);
        expect(pendingApprovalOf(caller)).toBeUndefined();
    });

    it('answers the pending approval of an approval wait without a url', () => {
        const run = {
            id: 'a1',
            status: RunStatus.WAITING,
            waiting: {
                kind: 'approval',
                id: '0:c1:0',
                approvalId: '0:c1:0',
                toolName: 'push',
                toolCallId: 'c1',
                title: 'Push?',
                body: 'the diff',
                expiresAt: new Date(REMOTE_START),
            },
        } as unknown as Run;

        expect(pendingApprovalOf(run)).toEqual({
            runId: 'a1', 
            approvalId: '0:c1:0', 
            title: 'Push?', 
        });
        expect(pendingApprovalOf({ ...run, status: RunStatus.QUEUED })).toBeUndefined();
    });
});
