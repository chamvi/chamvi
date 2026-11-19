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
import { z } from 'zod';
import { Permission } from '@chamvi/access';
import {
    AgentNotFoundError,
    Engine,
    ValidationError,
    agent,
    agentChannel,
    approve,
    defineRemoteAgent,
    defineSimpleAgent,
    dispatchTo,
    waitForDispatch,
} from '@chamvi/core';
import type {
    ChannelMessage,
    DispatchEnvelope,
    IChannel,
    PeerSettings,
    PeerStartInput,
} from '@chamvi/core';
import { RunStatus } from '@chamvi/store';
import type { Invoker, Run } from '@chamvi/store';
import { stableHash } from '../../../src/effect/helpers.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { createTestServices, servicesOf } from '../../utils/engine.ts';
import type { TestServiceSet } from '../../utils/engine.ts';
import { fakePeers, peerRunView, rejectWith } from '../../utils/peers.ts';
import type { FakePeers } from '../../utils/peers.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));
const LINK = 'https://ops.example/ui/approvals';

/** Exposes the engine's peer event hook, to replay a pause on the same approval. */
class ReceiverEngine extends Engine {
    firePeerEvent(run: Run): void {
        this.peerEvent(run);
    }
}

const engines: Engine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((e) => e.stop()));

    engines.length = 0;
});

function peerInvoker(id = 'dev-token', bindings: Invoker['bindings'] = [{ permission: { name: Permission.AGENT_RUN } } as never]): Invoker {
    return {
        id,
        kind: 'token',
        bindings,
    };
}

type Sent = { message: ChannelMessage; address: string };

function chatChannel(): { channel: IChannel; sent: Sent[] } {
    const sent: Sent[] = [];

    return {
        sent,
        channel: {
            name: 'chat',
            out: async (message, address) => {
                sent.push({ message, address });
            },
        },
    };
}

type Setup = {
    engine: ReceiverEngine;
    store: TestServiceSet;
    clock: ControllableClock;
    peers: FakePeers;
    errors: unknown[];
    chat: Sent[];
};

/**
 * Agents: `notify` (role `notify`, from `dev/maintainer`, a schema, maxDepth 2,
 * maxPerRun 2) returns its payload; `gated` (role `default`, from
 * `dev/maintainer`) pauses on an approval; `lead` (from `dev/maintainer`,
 * maxDepth 3) dispatches `gated` and waits; `relay` dispatches the remote
 * agent `deployer` at peer `ops` and waits; `top` dispatches `lead` and
 * waits (a grandchild approval); `spawner` dispatches `sink` with its
 * payload and returns the result. The fake peer `dev` is
 * recognized from the token `dev-token`.
 */
function setup(options: { dev?: Partial<PeerSettings> } = {}): Setup {
    const clock = new ControllableClock(START);
    const store = createTestServices({ clock });
    const peers = fakePeers({ dev: options.dev ?? {}, ops: {} }, { approvalUrl: (ref) => `https://me.example/ui/approvals?run=${ref.runId}&approval=${ref.approvalId}` });
    const errors: unknown[] = [];
    const chat = chatChannel();

    peers.recognize = (invoker) => (invoker?.kind === 'token' && invoker.id === 'dev-token' ? 'dev' : undefined);

    const notify = defineSimpleAgent({
        name: 'notify',
        channels: [agent.on({
            role: 'notify',
            from: ['dev/maintainer'],
            schema: z.object({ text: z.string() }),
            maxDepth: 2,
            maxPerRun: 2,
        })],
        run: async (payload) => payload,
    });
    const gated = defineSimpleAgent({
        name: 'gated',
        channels: [agent.on({ from: ['dev/maintainer', 'lead'], maxDepth: 3 })],
        run: async (_payload, ctx) => {
            const decision = await approve(ctx, { title: 'Go?' });

            return { approved: decision.approved };
        },
    });
    const lead = defineSimpleAgent({
        name: 'lead',
        channels: [agent.on({ from: ['dev/maintainer', 'top'], maxDepth: 3 })],
        run: async (payload, ctx) => waitForDispatch(ctx, await dispatchTo(ctx, { agent: 'gated', payload })),
    });
    const top = defineSimpleAgent({
        name: 'top',
        channels: [agent.on({ from: ['dev/maintainer'], maxDepth: 3 })],
        run: async (payload, ctx) => waitForDispatch(ctx, await dispatchTo(ctx, { agent: 'lead', payload })),
    });
    const spawner = defineSimpleAgent({
        name: 'spawner',
        channels: [agent.on({ from: ['dev/maintainer'], maxDepth: 3 })],
        run: async (payload, ctx) => dispatchTo(ctx, { agent: 'sink', payload }),
    });
    const sink = defineSimpleAgent({
        name: 'sink',
        channels: [agent.on({ from: ['dev/maintainer', 'spawner'], maxDepth: 3 })],
        run: async (payload) => payload,
    });
    const relay = defineSimpleAgent({
        name: 'relay',
        channels: [agent.on({ from: ['dev/maintainer'], maxDepth: 3 })],
        run: async (payload, ctx) => waitForDispatch(ctx, await dispatchTo(ctx, { agent: 'deployer', payload })),
    });
    const deployer = defineRemoteAgent({
        name: 'deployer',
        peer: 'ops',
        channels: [agent.on({ from: ['relay'], maxDepth: 3 })],
    });
    const engine = new ReceiverEngine({
        ...servicesOf(store),
        clock,
        claimTtlMs: 3_600_000,
        agents: [notify, gated, lead, top, relay, deployer, spawner, sink],
        channels: [agentChannel(), chat.channel],
        peers: peers.resolver,
        onError: (error) => {
            errors.push(error);
        },
    });

    engines.push(engine);

    return {
        engine,
        store,
        clock,
        peers,
        errors,
        chat: chat.sent,
    };
}

type PeerFields = PeerStartInput['peer'] & { role: string };

function fields(patch: Partial<PeerFields> = {}): PeerFields {
    return {
        role: 'notify',
        standIn: 'stand-in-1',
        parent: {
            runId: 'caller-1',
            agent: 'maintainer',
            depth: 0,
        },
        taint: false,
        ...patch,
    };
}

function envelope(patch: Partial<DispatchEnvelope> = {}): DispatchEnvelope {
    return {
        agent: 'notify',
        trigger: 'peer',
        channel: 'peer',
        payload: { text: 'hi' },
        idempotencyKey: 'stand-in-1',
        invoker: peerInvoker(),
        ...patch,
    };
}

async function allRuns(store: TestServiceSet): Promise<Run[]> {
    return (await store.runService.find({})).data;
}

async function readRun(store: TestServiceSet, runId: string): Promise<Run> {
    const run = await store.runService.findOne(runId);

    if (!run) {
        throw new Error(`Run ${runId} not found.`);
    }

    return run;
}

describe('the receiver: dispatchPeer()', () => {
    it('creates a run with the peer lineage, the peer invoker and no parentRunId', async () => {
        const { engine, store } = setup();

        await engine.start();

        const result = await engine.dispatchPeer(envelope(), fields({ origin: 'Peter' }));

        expect(result.deduplicated).toBe(false);

        await engine.idle();

        const run = await readRun(store, result.runId);

        expect(run.status).toBe(RunStatus.COMPLETED);
        expect(run.output).toEqual({ text: 'hi' });
        expect(run.parentRunId).toBeUndefined();
        expect(run.taint).toBeUndefined();
        expect(run.trigger.channel).toBe('agent');
        expect(run.trigger.trigger).toBe('notify');
        expect(run.trigger.parent).toEqual({
            kind: 'peer',
            peer: 'dev',
            runId: 'caller-1',
            standIn: 'stand-in-1',
            agent: 'maintainer',
            role: 'notify',
            depth: 1,
            origin: 'Peter',
        });
        expect(run.trigger.invoker).toMatchObject({ id: 'dev-token', kind: 'token' });
    });

    it.each<[string, () => { envelope: DispatchEnvelope; fields: PeerFields }]>([
        ['an unrecognized invoker', () => ({ envelope: envelope({ invoker: peerInvoker('other') }), fields: fields() })],
        ['no invoker', () => ({ envelope: envelope({ invoker: undefined }), fields: fields() })],
        ['a caller agent the role does not list', () => ({
            envelope: envelope(),
            fields: fields({
                parent: {
                    runId: 'caller-1', 
                    agent: 'other', 
                    depth: 0, 
                }, 
            }), 
        })],
        ['a local name in from', () => ({
            envelope: envelope({ agent: 'gated' }),
            fields: fields({
                role: 'default',
                parent: {
                    runId: 'caller-1', 
                    agent: 'lead', 
                    depth: 0, 
                }, 
            }), 
        })],
        ['no such role', () => ({ envelope: envelope(), fields: fields({ role: 'missing' }) })],
        ['a depth above maxDepth', () => ({
            envelope: envelope(),
            fields: fields({
                parent: {
                    runId: 'caller-1', 
                    agent: 'maintainer', 
                    depth: 2, 
                }, 
            }), 
        })],
        ['a schema failure', () => ({ envelope: envelope({ payload: { text: 1 } }), fields: fields() })],
        ['no idempotency key', () => ({ envelope: envelope({ idempotencyKey: undefined }), fields: fields() })],
        ['malformed fields', () => ({ envelope: envelope(), fields: fields({ standIn: '' }) })],
    ])('refuses %s with a ValidationError and writes nothing', async (_label, input) => {
        const { engine, store } = setup();
        const { envelope: env, fields: f } = input();

        await engine.start();

        await expect(engine.dispatchPeer(env, f)).rejects.toBeInstanceOf(ValidationError);

        expect(await allRuns(store)).toHaveLength(0);
        expect(await store.effectService.findOne('peer-count:dev:caller-1:notify:notify')).toBeUndefined();

        // no idempotency claim either: the same key starts a run once the input is valid
        const ok = await engine.dispatchPeer(envelope(), fields());

        expect(ok.deduplicated).toBe(false);
    });

    it('answers an ungranted agent like an unknown one, before any role, from or depth check', async () => {
        const { engine, store } = setup();
        const ungranted = envelope({ invoker: peerInvoker('dev-token', []) });

        const unknown = await engine.dispatchPeer(envelope({ agent: 'missing' }), fields()).catch((error: unknown) => error);
        const denied = await engine.dispatchPeer(envelope({ ...ungranted, agent: 'missing' }), fields()).catch((error: unknown) => error);

        expect(unknown).toBeInstanceOf(AgentNotFoundError);
        expect(denied).toBeInstanceOf(AgentNotFoundError);

        for (const f of [fields(), fields({ role: 'missing' }), fields({
            parent: {
                runId: 'caller-1', 
                agent: 'other', 
                depth: 7, 
            }, 
        })]) {
            const error = await engine.dispatchPeer(ungranted, f).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(AgentNotFoundError);
            expect((error as Error).message).toBe('unknown agent: notify');
        }

        expect(await allRuns(store)).toHaveLength(0);
    });

    it('keeps peer keys apart from local dispatch claim keys: a dispatch-shaped key squats nothing', async () => {
        const { engine, store } = setup();
        const payload = { x: 1 };
        // the peer-started run R, not started yet: the peer knows its id and payload
        const { runId: parentId } = await engine.dispatchPeer(envelope({ agent: 'spawner', payload }), fields({ role: 'default' }));
        const localKey = `dispatch:default:${parentId}:${stableHash({
            agent: 'sink',
            role: 'default',
            payload,
            concurrencyKey: undefined,
            address: undefined,
        })}`;
        const squat = await engine.dispatchPeer(
            envelope({
                agent: 'sink', 
                payload, 
                idempotencyKey: localKey, 
            }),
            fields({ role: 'default', standIn: 'evil' }),
        );

        await engine.start();
        await engine.idle();

        const parent = await readRun(store, parentId);
        const child = (parent.output as { runId: string; deduplicated: boolean });

        expect(parent.status).toBe(RunStatus.COMPLETED);
        expect(child.deduplicated).toBe(false);
        expect(child.runId).not.toBe(squat.runId);
        expect((await readRun(store, child.runId)).trigger.parent).toMatchObject({ kind: 'dispatch', runId: parentId });

        // the same peer key still dedupes into the same run
        expect(await engine.dispatchPeer(
            envelope({
                agent: 'sink', 
                payload, 
                idempotencyKey: localKey, 
            }),
            fields({ role: 'default', standIn: 'evil' }),
        )).toEqual({ runId: squat.runId, deduplicated: true });
    });

    it('refuses a start while another replica holds the count lock, and counts it on the resend', async () => {
        const { engine, store } = setup();
        const lockKey = 'peer-count:peer-count:dev:caller-1:notify:notify';

        expect(await store.lockService.acquire(lockKey, 'other-replica', 60_000)).toBe(true);

        await expect(engine.dispatchPeer(envelope(), fields())).rejects.not.toBeInstanceOf(ValidationError);
        expect(await allRuns(store)).toHaveLength(0);
        expect(await store.effectService.findOne('peer-count:dev:caller-1:notify:notify')).toBeUndefined();

        await store.lockService.release(lockKey, 'other-replica');

        expect(await engine.dispatchPeer(envelope(), fields())).toMatchObject({ deduplicated: false });
        expect(await store.effectService.findOne('peer-count:dev:caller-1:notify:notify')).toMatchObject({ result: { count: 1 } });
        // released after the start
        expect(await store.lockService.acquire(lockKey, 'other-replica', 60_000)).toBe(true);
    });

    it('counts maxPerRun per peer, caller run, agent and role, and refuses beyond it', async () => {
        const { engine, store } = setup();

        await engine.start();

        await engine.dispatchPeer(envelope({ idempotencyKey: 'a' }), fields({ standIn: 'a' }));
        await engine.dispatchPeer(envelope({ idempotencyKey: 'b' }), fields({ standIn: 'b' }));

        expect(await store.effectService.findOne('peer-count:dev:caller-1:notify:notify')).toMatchObject({ result: { count: 2 } });

        await expect(engine.dispatchPeer(envelope({ idempotencyKey: 'c' }), fields({ standIn: 'c' }))).rejects.toBeInstanceOf(ValidationError);

        // a resend of a counted call spends no slot
        expect(await engine.dispatchPeer(envelope({ idempotencyKey: 'a' }), fields({ standIn: 'a' }))).toMatchObject({ deduplicated: true });
        // the key is the call's identity: a resend whose validated payload differs (a schema adding a fresh value) reuses the slot
        expect(await engine.dispatchPeer(
            envelope({ idempotencyKey: 'b', payload: { text: 'changed' } }),
            fields({ standIn: 'b' }),
        )).toMatchObject({ deduplicated: true });

        // another caller run has its own count
        expect(await engine.dispatchPeer(
            envelope({ idempotencyKey: 'd' }),
            fields({
                standIn: 'd',
                parent: {
                    runId: 'caller-2', 
                    agent: 'maintainer', 
                    depth: 0, 
                }, 
            }),
        )).toMatchObject({ deduplicated: false });
        expect(await allRuns(store)).toHaveLength(3);
    });

    it('taints the run from the start when the caller is tainted', async () => {
        const { engine, store } = setup();
        const { runId } = await engine.dispatchPeer(envelope(), fields({ taint: true }));
        const run = await readRun(store, runId);

        expect(run.taint).toEqual({ at: expect.any(Date), source: 'peer:dev' });
    });

    it('deduplicates the same idempotency key into one run', async () => {
        const { engine, store } = setup();
        const first = await engine.dispatchPeer(envelope(), fields());
        const second = await engine.dispatchPeer(envelope(), fields());

        expect(second).toEqual({ runId: first.runId, deduplicated: true });
        expect(await allRuns(store)).toHaveLength(1);
    });

    it('never takes a parent or a taint from engine.dispatch()', async () => {
        const { engine, store } = setup();
        const { runId } = await engine.dispatch({
            ...envelope({
                agent: 'notify', 
                trigger: 'notify', 
                channel: 'test', 
            }),
            parent: fields() as never,
            taint: true,
        } as DispatchEnvelope);
        const run = await readRun(store, runId);

        expect(run.trigger.parent).toBeUndefined();
        expect(run.taint).toBeUndefined();
    });
});

describe('the receiver: ping and notification', () => {
    it('wakes the stand-in once when a peer-started run settles', async () => {
        const {
            engine, 
            peers, 
            errors, 
        } = setup();

        await engine.start();
        await engine.dispatchPeer(envelope(), fields());
        await engine.idle();

        expect(peers.calls.wake.map((c) => ({ peer: c.peer, runId: c.runId }))).toEqual([{ peer: 'dev', runId: 'stand-in-1' }]);
        expect(errors).toEqual([]);
    });

    it('wakes the stand-in when a run below the peer-started run pauses on an approval', async () => {
        const {
            engine, 
            store, 
            peers, 
        } = setup();

        await engine.start();

        const { runId } = await engine.dispatchPeer(
            envelope({ agent: 'lead', payload: {} }),
            fields({ role: 'default' }),
        );

        await engine.idle();

        const [child] = (await store.runService.find({ parentRunId: runId })).data;

        expect(child?.status).toBe(RunStatus.WAITING);
        expect(child?.waiting?.kind).toBe('approval');
        expect((await readRun(store, runId)).status).toBe(RunStatus.WAITING);
        expect(peers.calls.wake.map((c) => c.runId)).toEqual(['stand-in-1']);
    });

    it('wakes the stand-in when a nested stand-in surfaces a remote approval', async () => {
        const {
            engine, 
            store, 
            peers, 
        } = setup();

        peers.script('start', { runId: 'ops-1' });
        peers.script('read', peerRunView('ops-1', {
            status: 'waiting',
            waiting: 'approval',
            approval: {
                runId: 'ops-1',
                approvalId: '0:run:0',
                title: 'Deploy?',
                url: LINK,
            },
        }));

        await engine.start();

        const { runId } = await engine.dispatchPeer(envelope({ agent: 'relay', payload: {} }), fields({ role: 'default' }));

        await engine.idle();

        expect(peers.calls.wake).toHaveLength(0);

        await engine.tick();
        await engine.idle();

        const [standIn] = (await store.runService.find({ parentRunId: runId })).data;

        expect(standIn?.waiting).toMatchObject({ kind: 'remote', remote: { approval: { approvalId: '0:run:0' } } });
        expect(peers.calls.wake.map((c) => ({ peer: c.peer, runId: c.runId }))).toEqual([{ peer: 'dev', runId: 'stand-in-1' }]);
    });

    it('sends no wake to a peer without outgoing', async () => {
        const { engine, peers } = setup({ dev: { outgoing: false } });

        await engine.start();
        await engine.dispatchPeer(envelope({ agent: 'gated', payload: {} }), fields({ role: 'default' }));
        await engine.idle();

        expect(peers.calls.wake).toHaveLength(0);
    });

    it('reports a failed wake only to onError and keeps the run', async () => {
        const {
            engine,
            store,
            peers,
            errors,
        } = setup();

        peers.script('wake', rejectWith(new Error('peer down')));

        await engine.start();

        const { runId } = await engine.dispatchPeer(envelope(), fields());

        await engine.idle();

        expect((await readRun(store, runId)).status).toBe(RunStatus.COMPLETED);
        expect(errors).toEqual([expect.objectContaining({ message: 'peer down' })]);
    });

    it('notifies the peer\'s approvals destination once per approval', async () => {
        const {
            engine,
            store,
            chat,
            errors,
        } = setup({ dev: { approvals: { channel: 'chat', address: 'dev-room' } } });

        await engine.start();

        const { runId } = await engine.dispatchPeer(envelope({ agent: 'gated', payload: {} }), fields({ role: 'default' }));

        await engine.idle();

        const run = await readRun(store, runId);
        const approvalId = run.waiting?.kind === 'approval' ? run.waiting.approvalId : '';

        expect(chat).toHaveLength(1);
        expect(chat[0]!.address).toBe('dev-room');
        expect(chat[0]!.message).toMatchObject({
            kind: 'message',
            key: `peer-notify:${runId}:${approvalId}`,
            runId,
            agent: 'gated',
            title: 'Go?',
        });
        expect(chat[0]!.message.body).toContain(`https://me.example/ui/approvals?run=${runId}&approval=${approvalId}`);
        expect(chat[0]!.message).not.toHaveProperty('approvalId');
        expect(await store.effectService.findOne(`peer-notify:${runId}:${approvalId}`)).toBeDefined();
        expect(errors).toEqual([]);
    });

    it('notifies an approval in a grandchild of the peer-started run', async () => {
        const {
            engine,
            store,
            chat,
            peers,
        } = setup({ dev: { approvals: { channel: 'chat', address: 'dev-room' } } });

        await engine.start();

        const { runId } = await engine.dispatchPeer(envelope({ agent: 'top', payload: {} }), fields({ role: 'default' }));

        await engine.idle();

        const [child] = (await store.runService.find({ parentRunId: runId })).data;
        const [grandchild] = (await store.runService.find({ parentRunId: child!.id })).data;

        expect(grandchild?.agent).toBe('gated');
        expect(grandchild?.waiting?.kind).toBe('approval');
        expect(chat).toHaveLength(1);
        expect(chat[0]!.message).toMatchObject({
            runId: grandchild!.id, 
            agent: 'gated', 
            title: 'Go?', 
        });
        expect(peers.calls.wake.map((c) => c.runId)).toEqual(['stand-in-1']);
    });

    it('sends the notification once when the run pauses on the same approval again', async () => {
        const {
            engine,
            store,
            chat,
            errors,
        } = setup({ dev: { approvals: { channel: 'chat', address: 'dev-room' } } });

        await engine.start();

        const { runId } = await engine.dispatchPeer(envelope({ agent: 'gated', payload: {} }), fields({ role: 'default' }));

        await engine.idle();

        engine.firePeerEvent(await readRun(store, runId));
        await engine.idle();

        expect(chat).toHaveLength(1);
        expect(errors).toEqual([]);
    });

    it('sends no notification without an approvals destination', async () => {
        const { engine, chat } = setup();

        await engine.start();
        await engine.dispatchPeer(envelope({ agent: 'gated', payload: {} }), fields({ role: 'default' }));
        await engine.idle();

        expect(chat).toHaveLength(0);
    });
});
