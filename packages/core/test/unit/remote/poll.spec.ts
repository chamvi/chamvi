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
import { PEER_REQUEST_TIMEOUT_MS } from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import { RunStatus } from '@chamvi/store';
import type { Invoker, Run } from '@chamvi/store';
import { peerRequest } from '../../../src/engine/remote/helpers.ts';
import { ControllableClock } from '../../utils/clock.ts';
import { peerRunView, rejectWith } from '../../utils/peers.ts';
import {
    readRun,
    setupRemote,
    startStandIn,
} from '../../utils/remote.ts';

const POLL_MS = 60_000;

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((e) => e.stop()));

    engines.length = 0;
});

const flush = () => new Promise<void>((resolve) => {
    setTimeout(resolve, 5);
});

/** The engine polls the queue every claimTtlMs / 3: far apart, so only the explicit ticks poll. */
function setup(options: Parameters<typeof setupRemote>[0] = {}) {
    const ctx = setupRemote({
        ...options,
        peers: options.peers ?? { dev: {}, ops: {} },
        engine: { claimTtlMs: 3_600_000, ...options.engine },
    });

    engines.push(ctx.engine);

    return ctx;
}

async function tickIdle(...targets: IEngine[]): Promise<void> {
    await Promise.all(targets.map((e) => e.tick()));
    await Promise.all(targets.map((e) => e.idle()));
}

function token(id: string): Invoker {
    return {
        kind: 'token',
        id,
        bindings: [],
    };
}

describe('the stand-in run: poll, wake, timeout and cancel', () => {
    it('polls at the first tick, then once per window', async () => {
        const {
            engine,
            clock,
            peers,
        } = setup();

        peers.script('start', { runId: 'r1' });
        await startStandIn(engine);

        expect(peers.calls.read).toHaveLength(0);

        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(1);
        expect(peers.calls.read[0]).toMatchObject({ peer: 'dev', runId: 'r1' });

        clock.advance(POLL_MS - 1);
        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(1);

        clock.advance(1);
        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(2);
    });

    it('polls once per window across engines', async () => {
        const {
            engine,
            peers,
            replica,
        } = setup();
        const other = replica();

        engines.push(other);
        peers.script('start', { runId: 'r1' });
        await startStandIn(engine);
        await tickIdle(engine, other);

        expect(peers.calls.read).toHaveLength(1);

        await tickIdle(other, engine);

        expect(peers.calls.read).toHaveLength(1);
    });

    it('waits for Retry-After when the peer asks for more than the window', async () => {
        const {
            engine,
            store,
            clock,
            peers,
            errors,
        } = setup();
        const busy = new Error('busy');

        peers.script('start', { runId: 'r1' });
        peers.script('read', rejectWith(busy, { retryAfterMs: 120_000 }));

        const runId = await startStandIn(engine);

        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(1);
        expect(errors).toContain(busy);

        clock.advance(POLL_MS);
        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(1);

        clock.advance(POLL_MS);
        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(2);
        expect((await readRun(store, runId)).status).toBe(RunStatus.WAITING);
    });

    it('wake from another engine polls on the next tick', async () => {
        const {
            engine,
            store,
            clock,
            peers,
            replica,
        } = setup();
        const other = replica();

        engines.push(other);
        peers.recognize = (invoker) => (invoker?.id === 'dev-token' ? 'dev' : undefined);
        peers.script('start', { runId: 'r1' });

        const runId = await startStandIn(engine);

        await tickIdle(engine);
        clock.advance(10_000);

        const before = await readRun(store, runId);

        expect(await other.wake(runId, token('dev-token'))).toBe(true);

        const woken = await readRun(store, runId);

        expect(woken.waiting).toMatchObject({ kind: 'remote', wakeRequested: true });
        // a derived mark: the wait step's start (updatedAt) is kept
        expect(woken.updatedAt).toEqual(before.updatedAt);

        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(2);

        const polled = await readRun(store, runId);

        expect(polled.status).toBe(RunStatus.WAITING);
        expect(polled.waiting).not.toHaveProperty('wakeRequested');

        // the mark was used: the window holds again
        await tickIdle(engine);

        expect(peers.calls.read).toHaveLength(2);
    });

    it('refuses a wake that is not for a stand-in waiting on that peer', async () => {
        const {
            engine,
            store,
            peers,
        } = setup();

        peers.recognize = (invoker) => {
            if (invoker?.id === 'dev-token') {
                return 'dev';
            }

            return invoker?.id === 'ops-token' ? 'ops' : undefined;
        };
        peers.script('start', { runId: 'r1' }, { runId: 'r2' });

        const runId = await startStandIn(engine);
        const settled = (await engine.dispatch({
            agent: 'developer',
            trigger: 'test',
            channel: 'test',
            payload: { task: 'other' },
        })).runId;

        await engine.idle();

        const view = ({ runId: id }: { runId: string }) => peerRunView(id, id === 'r2' ? { status: 'completed', output: 'done' } : {});

        peers.script('read', view, view);
        await engine.tick();
        await engine.idle();

        const { runId: alfred } = await engine.dispatch({
            agent: 'alfred',
            trigger: 'test',
            channel: 'test',
            payload: {},
        });

        await engine.idle();

        const snapshot = async (): Promise<Run[]> => Promise.all([runId, settled, alfred].map((id) => readRun(store, id)));
        const before = await snapshot();
        const updates: unknown[] = [];

        engine.on('run.updated', (event) => {
            updates.push(event);
        });

        expect(await engine.wake(runId, undefined)).toBe(false);
        expect(await engine.wake(runId, token('someone'))).toBe(false);
        expect(await engine.wake(runId, token('ops-token'))).toBe(false);
        expect(await engine.wake(alfred, token('dev-token'))).toBe(false);
        expect(await engine.wake('0190f0b8-0000-7000-8000-000000000000', token('dev-token'))).toBe(false);
        expect(await engine.wake(settled, token('dev-token'))).toBe(false);

        expect(await snapshot()).toEqual(before);
        expect(updates).toEqual([]);
    });

    it('settles a stand-in whose remote run completed', async () => {
        const {
            engine,
            store,
            peers,
        } = setup();

        peers.script('start', { runId: 'r1' });
        peers.script('read', peerRunView('r1', {
            status: 'completed',
            output: { merged: true },
            usage: { inputTokens: 3, outputTokens: 4 },
        }));

        const runId = await startStandIn(engine);

        await tickIdle(engine);

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.COMPLETED);
        expect(run.output).toEqual({ merged: true });
        expect(run.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
        expect(peers.calls.read).toHaveLength(1);
    });

    it('keeps waiting while the remote run is still running or the read fails', async () => {
        const {
            engine,
            store,
            clock,
            peers,
            errors,
        } = setup();
        const down = new Error('down');

        peers.script('start', { runId: 'r1' });
        peers.script('read', peerRunView('r1', { status: 'waiting', waiting: 'approval' }), rejectWith(down), rejectWith(down));

        const runId = await startStandIn(engine);

        for (let i = 0; i < 3; i++) {
            await tickIdle(engine);
            clock.advance(POLL_MS);
        }

        expect(peers.calls.read).toHaveLength(3);
        expect(errors.filter((error) => error === down)).toHaveLength(2);
        expect((await readRun(store, runId)).status).toBe(RunStatus.WAITING);
    });

    it('fails a stand-in at expiresAt with Timeout and cancels the remote run once', async () => {
        const {
            engine,
            store,
            clock,
            peers,
        } = setup({ developer: { timeoutMs: 300_000 } });

        peers.script('start', { runId: 'r1' });

        const runId = await startStandIn(engine);

        await tickIdle(engine);
        clock.advance(300_000);
        await tickIdle(engine);
        await tickIdle(engine);

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.FAILED);
        expect(run.error?.code).toBe('Timeout');
        expect(peers.calls.cancel).toHaveLength(1);
        expect(peers.calls.cancel[0]).toMatchObject({ peer: 'dev', runId: 'r1' });
        // no poll past the deadline
        expect(peers.calls.read).toHaveLength(1);
    });

    it('cancels the remote run when the stand-in is cancelled', async () => {
        const {
            engine,
            store,
            peers,
        } = setup();

        peers.script('start', { runId: 'r1' });

        const runId = await startStandIn(engine);

        await engine.cancel(runId);
        await engine.idle();

        expect((await readRun(store, runId)).status).toBe(RunStatus.CANCELLED);
        expect(peers.calls.cancel).toHaveLength(1);
        expect(peers.calls.cancel[0]).toMatchObject({ peer: 'dev', runId: 'r1' });
    });

    it('reports a rejected remote cancel to onError only', async () => {
        const {
            engine,
            store,
            peers,
            errors,
        } = setup();
        const down = new Error('down');

        peers.script('start', { runId: 'r1' });
        peers.script('cancel', rejectWith(down));

        const runId = await startStandIn(engine);

        await expect(engine.cancel(runId)).resolves.toBeUndefined();
        await engine.idle();

        expect((await readRun(store, runId)).status).toBe(RunStatus.CANCELLED);
        expect(errors).toEqual([down]);
    });

    it('does not hold tick() or recover() on a read, and drain() aborts it', async () => {
        const {
            engine,
            store,
            clock,
            peers,
            errors,
        } = setup();
        let signal: AbortSignal | undefined;

        peers.script('start', { runId: 'r1' });
        peers.script('read', ({ opts }) => {
            ({ signal } = opts);

            return new Promise(() => {});
        });

        const runId = await startStandIn(engine);

        await engine.tick();
        await engine.recover();

        expect(peers.calls.read).toHaveLength(1);

        const drained = engine.drain({ timeoutMs: 1_000 });

        await flush();
        clock.advance(1_000);
        await drained;

        expect(signal?.aborted).toBe(true);
        expect(errors).toEqual([]);
        expect((await readRun(store, runId)).status).toBe(RunStatus.WAITING);
    });

    it('aborts a read past the peer request deadline', async () => {
        const {
            engine,
            clock,
            peers,
            errors,
        } = setup();

        peers.script('start', { runId: 'r1' });
        peers.script('read', () => new Promise(() => {}));
        await startStandIn(engine);
        await engine.tick();

        const idle = engine.idle();

        await flush();
        clock.advance(PEER_REQUEST_TIMEOUT_MS);
        await idle;

        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ code: 'Timeout' });
    });

    it('contains a transport that throws synchronously, also through drain()', async () => {
        const {
            engine,
            store,
            clock,
            peers,
            errors,
        } = setup();
        const gone = new Error('peer "dev" is not configured');

        peers.script('start', { runId: 'r1' });

        const runId = await startStandIn(engine);

        // a peer removed from the configuration while its stand-in waits
        peers.resolver.transport = () => {
            throw gone;
        };

        await engine.tick();
        await engine.idle();

        expect(errors).toEqual([gone]);

        const drained = engine.drain({ timeoutMs: 1_000 });

        await flush();
        clock.advance(1_000);
        await drained;
        await flush();

        expect(errors).toEqual([gone]);
        expect((await readRun(store, runId)).status).toBe(RunStatus.WAITING);
    });
});

describe('peerRequest', () => {
    it('rejects with a synchronous throw and leaves nothing pending on a later abort', async () => {
        const clock = new ControllableClock(0);
        const controller = new AbortController();
        const gone = new Error('gone');

        await expect(peerRequest(clock, controller.signal, () => {
            throw gone;
        })).rejects.toBe(gone);

        controller.abort(new Error('later'));
        clock.advance(PEER_REQUEST_TIMEOUT_MS);
        await flush();
    });
});

