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
    InvalidAgentDefinitionError,
    PEER_REQUEST_TIMEOUT_MS,
    ValidationError,
    agent,
    defineRemoteAgent,
    defineSimpleAgent,
    dispatchTo,
} from '@chamvi/core';
import type { IEngine, RemoteAgent } from '@chamvi/core';
import { RunStatus } from '@chamvi/store';
import { rejectWith } from '../../utils/peers.ts';
import {
    REMOTE_START,
    readRun,
    setupRemote,
    startStandIn,
} from '../../utils/remote.ts';

const DAY = 86_400_000;

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((e) => e.stop()));

    engines.length = 0;
});

function setup(...args: Parameters<typeof setupRemote>) {
    const ctx = setupRemote(...args);

    engines.push(ctx.engine);

    return ctx;
}

/** Starts the engine and dispatches `developer` without waiting for its execution. */
async function dispatchStandIn(engine: IEngine): Promise<string> {
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'developer',
        trigger: 'test',
        channel: 'test',
        payload: { task: 'upgrade' },
    });

    return runId;
}

describe('the stand-in run: start', () => {
    it('starts the remote run once and pauses on a remote wait', async () => {
        const {
            engine,
            store,
            peers,
        } = setup();

        peers.script('start', { runId: 'r1' });

        const runId = await startStandIn(engine);

        expect(peers.calls.start).toHaveLength(1);
        expect(peers.calls.start[0]!.peer).toBe('dev');
        expect(peers.calls.start[0]!.input).toEqual({
            agent: 'developer',
            role: 'default',
            payload: { task: 'upgrade' },
            idempotencyKey: runId,
            peer: {
                standIn: runId,
                parent: {
                    runId,
                    agent: 'developer',
                    depth: 0,
                },
                taint: false,
            },
        });

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.WAITING);
        expect(run.waiting).toEqual({
            kind: 'remote',
            id: 'remote',
            peer: 'dev',
            agent: 'developer',
            remoteRunId: 'r1',
            expiresAt: new Date(REMOTE_START.getTime() + DAY),
        });
        expect(run.claim).toBeUndefined();
        expect((await store.stepService.find(runId)).filter((step) => step.kind === 'llm')).toEqual([]);
    });

    it('targets the configured agent and role and keeps the timeout', async () => {
        const {
            engine,
            store,
            peers,
        } = setup({
            developer: {
                agent: 'maintainer',
                role: 'upgrade',
                timeoutMs: 3_600_000,
            },
        });

        const runId = await startStandIn(engine);

        expect(peers.calls.start[0]!.input).toMatchObject({ agent: 'maintainer', role: 'upgrade' });

        const run = await readRun(store, runId);

        expect(run.waiting).toMatchObject({
            agent: 'maintainer',
            remoteRunId: 'remote-1',
            expiresAt: new Date(REMOTE_START.getTime() + 3_600_000),
        });
    });

    it('sends the invoker name as origin and forwards the attachments', async () => {
        const { engine, peers } = setup();
        const data = new TextEncoder().encode('hello');

        await startStandIn(engine, {
            invoker: {
                id: 'u1',
                kind: 'user',
                name: 'Peter',
                bindings: [],
            },
            attachments: [{
                mediaType: 'text/plain',
                filename: 'a.txt',
                data,
            }],
        });

        const { input } = peers.calls.start[0]!;

        expect(input.peer.origin).toBe('Peter');
        expect(input.attachments).toEqual([{
            mediaType: 'text/plain',
            filename: 'a.txt',
            data,
        }]);
    });

    it('names the dispatching run as parent', async () => {
        const {
            engine,
            store,
            peers,
        } = setup();

        await engine.start();

        const { runId: alfredId } = await engine.dispatch({
            agent: 'alfred',
            trigger: 'test',
            channel: 'test',
            payload: 'go',
        });

        await engine.idle();

        expect(peers.calls.start).toHaveLength(1);

        const { input } = peers.calls.start[0]!;
        const { data: [standIn] } = await store.runService.find({ parentRunId: alfredId });

        expect(input.payload).toBe('go');
        expect(input.idempotencyKey).toBe(standIn!.id);
        expect(input.peer).toEqual({
            standIn: standIn!.id,
            parent: {
                runId: alfredId,
                agent: 'alfred',
                // a root caller: the peer's run lands at depth 1, as a local dispatch would
                depth: 0,
            },
            taint: false,
        });
    });

    it('sends the depth of a dispatched calling run, not the stand-in\'s', async () => {
        const developer = defineRemoteAgent({
            name: 'developer',
            peer: 'dev',
            channels: [agent.on({ from: ['alfred'], maxDepth: 2 })],
        });
        const alfred = defineSimpleAgent({
            name: 'alfred',
            channels: [agent.on({ from: ['lead'] })],
            run: async (payload, ctx) => dispatchTo(ctx, { agent: 'developer', payload }),
        });
        const lead = defineSimpleAgent({
            name: 'lead',
            run: async (payload, ctx) => dispatchTo(ctx, { agent: 'alfred', payload }),
        });
        const {
            engine,
            store,
            peers,
        } = setup({ engine: { agents: [developer, alfred, lead] } });

        await engine.start();
        await engine.dispatch({
            agent: 'lead',
            trigger: 'test',
            channel: 'test',
            payload: 'go',
        });
        await engine.idle();

        const { data: [alfredRun] } = await store.runService.find({ agent: 'alfred' });

        expect(alfredRun?.trigger.parent?.depth).toBe(1);
        expect(peers.calls.start).toHaveLength(1);
        expect(peers.calls.start[0]!.input.peer.parent).toEqual({
            runId: alfredRun!.id,
            agent: 'alfred',
            depth: 1,
        });
    });

    it('sends taint when the dispatching run is tainted', async () => {
        const { engine, peers } = setup();

        await engine.start();
        await engine.dispatch({
            agent: 'alfred',
            trigger: 'test',
            channel: 'web',
            payload: 'go',
        });
        await engine.idle();

        expect(peers.calls.start[0]!.input.peer.taint).toBe(true);
    });

    it('fails the run with a start ValidationError', async () => {
        const {
            engine,
            store,
            peers,
        } = setup();

        peers.script('start', rejectWith(new ValidationError('The payload is invalid.')));

        const runId = await startStandIn(engine);
        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.FAILED);
        expect(run.error).toEqual({ code: 'validation_error', message: 'The payload is invalid.' });
    });

    it('resends a lost start under the same key', async () => {
        const {
            engine,
            store,
            clock,
            peers,
            errors,
            replica,
        } = setup();
        const created = new Set<string>();
        const lost = new Error('socket hang up');

        peers.script(
            'start',
            ({ input }) => {
                // the remote created the run, the answer never arrived
                created.add(input.idempotencyKey);

                throw lost;
            },
            ({ input }) => {
                created.add(input.idempotencyKey);

                return { runId: 'r1' };
            },
        );

        const runId = await startStandIn(engine);

        // the execution failed, the run did not: it stays running for recovery
        expect((await readRun(store, runId)).status).toBe(RunStatus.RUNNING);
        expect(errors).toContain(lost);

        clock.advance(120_000);
        await engine.recover();
        await engine.idle();

        expect(peers.calls.start).toHaveLength(2);
        expect(peers.calls.start[1]!.input.idempotencyKey).toBe(runId);
        expect([...created]).toEqual([runId]);
        expect((await readRun(store, runId)).waiting).toMatchObject({ kind: 'remote', remoteRunId: 'r1' });

        // a crash after the record: another engine recovers the run and sends no start
        await store.runService.update(runId, {
            status: RunStatus.RUNNING,
            waiting: undefined,
            claim: { owner: 'gone', expiresAt: new Date(clock.now() - 1) },
        });

        await engine.stop();

        const other = replica();

        engines.push(other);
        await other.start();
        await other.recover();
        await other.idle();

        expect(peers.calls.start).toHaveLength(2);

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.WAITING);
        expect(run.waiting).toMatchObject({ kind: 'remote', remoteRunId: 'r1' });
    });

    it('retries under the same key when recording the start fails', async () => {
        const {
            engine,
            store,
            clock,
            peers,
            errors,
        } = setup();
        const broken = new Error('store down');
        const save = store.effectService.save.bind(store.effectService);
        let failures = 1;

        store.effectService.save = (key, value) => {
            if (key.startsWith('remote-start:') && failures-- > 0) {
                return Promise.reject(broken);
            }

            return save(key, value);
        };
        peers.script('start', { runId: 'r1' }, { runId: 'r1' });

        const runId = await startStandIn(engine);

        expect((await readRun(store, runId)).status).toBe(RunStatus.RUNNING);
        expect(errors).toEqual([broken]);

        clock.advance(120_000);
        await engine.recover();
        await engine.idle();

        expect(peers.calls.start.map((call) => call.input.idempotencyKey)).toEqual([runId, runId]);
        expect((await readRun(store, runId)).waiting).toMatchObject({ kind: 'remote', remoteRunId: 'r1' });
    });

    it('re-pauses without a second start when the pause write fails', async () => {
        const {
            engine,
            store,
            clock,
            peers,
            errors,
        } = setup();
        const broken = new Error('store down');
        const update = store.runService.update.bind(store.runService);
        let failures = 1;

        store.runService.update = (id, patch, expect) => {
            if (patch.status === RunStatus.WAITING && failures-- > 0) {
                return Promise.reject(broken);
            }

            return update(id, patch, expect);
        };
        peers.script('start', { runId: 'r1' });

        const runId = await startStandIn(engine);

        expect((await readRun(store, runId)).status).toBe(RunStatus.RUNNING);
        expect(errors).toEqual([broken]);

        clock.advance(120_000);
        await engine.recover();
        await engine.idle();

        expect(peers.calls.start).toHaveLength(1);
        expect((await readRun(store, runId)).waiting).toMatchObject({ kind: 'remote', remoteRunId: 'r1' });
    });

    it('cancels the remote run once when a cancel arrives while the start is in flight', async () => {
        const {
            engine,
            store,
            peers,
        } = setup();
        const sent = Promise.withResolvers<void>();
        const answer = Promise.withResolvers<{ runId: string }>();
        let aborted = false;

        peers.script('start', ({ opts }) => {
            opts.signal.addEventListener('abort', () => {
                aborted = true;
            });
            sent.resolve();

            return answer.promise;
        });

        await engine.start();

        const { runId } = await engine.dispatch({
            agent: 'developer',
            trigger: 'test',
            channel: 'test',
            payload: { task: 'upgrade' },
        });

        await sent.promise;

        const cancelled = engine.cancel(runId);

        // the peer created the run: its answer still arrives after the cancel
        answer.resolve({ runId: 'r1' });
        await cancelled;
        await engine.idle();

        expect(aborted).toBe(false);
        expect((await readRun(store, runId)).status).toBe(RunStatus.CANCELLED);
        expect(peers.calls.cancel.map((call) => call.runId)).toEqual(['r1']);
    });

    it('answers a cancel at once while the start is in flight and cancels the remote run once it answers', async () => {
        const {
            engine,
            store,
            peers,
            errors,
        } = setup();
        const sent = Promise.withResolvers<void>();
        const answer = Promise.withResolvers<{ runId: string }>();

        peers.script('start', () => {
            sent.resolve();

            return answer.promise;
        });

        const runId = await dispatchStandIn(engine);

        await sent.promise;

        // the cancel does not wait for the start's answer
        await engine.cancel(runId);

        expect((await readRun(store, runId)).status).toBe(RunStatus.CANCELLED);
        expect(peers.calls.cancel).toHaveLength(0);

        answer.resolve({ runId: 'r1' });
        await engine.idle();

        expect(peers.calls.start).toHaveLength(1);
        expect(peers.calls.cancel.map((call) => call.runId)).toEqual(['r1']);
        expect((await readRun(store, runId)).status).toBe(RunStatus.CANCELLED);
        expect(errors).toEqual([]);
    });

    it('resends the start under the same key after a cancel when the in-flight start times out, then cancels', async () => {
        const {
            engine,
            store,
            clock,
            peers,
            errors,
        } = setup();
        const sent = Promise.withResolvers<void>();

        peers.script(
            'start',
            // the peer created the run, its answer never arrives (and the transport ignores the signal)
            () => {
                sent.resolve();

                return new Promise<never>(() => {});
            },
            { runId: 'r1' },
        );

        const runId = await dispatchStandIn(engine);

        await sent.promise;
        await engine.cancel(runId);

        expect((await readRun(store, runId)).status).toBe(RunStatus.CANCELLED);

        clock.advance(PEER_REQUEST_TIMEOUT_MS);
        await engine.idle();

        expect(peers.calls.start.map((call) => call.input.idempotencyKey)).toEqual([runId, runId]);
        expect(peers.calls.cancel.map((call) => call.runId)).toEqual(['r1']);
        expect((await readRun(store, runId)).status).toBe(RunStatus.CANCELLED);
        expect(errors).toEqual([]);
    });

    it('resends a cancelled start once and reports a second failure to onError only', async () => {
        const {
            engine,
            store,
            peers,
            errors,
        } = setup();
        const sent = Promise.withResolvers<void>();
        const first = Promise.withResolvers<{ runId: string }>();
        const down = new Error('still down');

        peers.script(
            'start',
            () => {
                sent.resolve();

                return first.promise;
            },
            rejectWith(down),
        );

        const runId = await dispatchStandIn(engine);

        await sent.promise;
        await engine.cancel(runId);

        first.reject(new Error('socket hang up'));
        await engine.idle();

        expect(peers.calls.start).toHaveLength(2);
        expect(peers.calls.cancel).toHaveLength(0);
        expect(errors).toEqual([down]);

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.CANCELLED);
        expect(run.error).toBeUndefined();
    });

    it('sends no resend after a cancel when the peer refused the start', async () => {
        const {
            engine,
            peers,
            errors,
        } = setup();
        const sent = Promise.withResolvers<void>();
        const first = Promise.withResolvers<{ runId: string }>();

        peers.script('start', () => {
            sent.resolve();

            return first.promise;
        });

        const runId = await dispatchStandIn(engine);

        await sent.promise;
        await engine.cancel(runId);

        first.reject(new ValidationError('The payload is invalid.'));
        await engine.idle();

        expect(peers.calls.start).toHaveLength(1);
        expect(peers.calls.cancel).toHaveLength(0);
        expect(errors).toEqual([]);
    });

    it('aborts the detached start of a cancelled run on drain, without a resend or an error', async () => {
        const {
            engine,
            clock,
            peers,
            errors,
        } = setup();
        const sent = Promise.withResolvers<AbortSignal>();

        peers.script('start', ({ opts }) => {
            sent.resolve(opts.signal);

            return new Promise<never>(() => {});
        });

        const runId = await dispatchStandIn(engine);
        const signal = await sent.promise;

        await engine.cancel(runId);

        const drained = engine.drain({ timeoutMs: 1_000 });

        // drain arms its deadline after stopping the channels and the queue
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        clock.advance(1_000);
        await drained;

        expect(signal.aborted).toBe(true);
        expect(peers.calls.start).toHaveLength(1);
        expect(peers.calls.cancel).toHaveLength(0);
        expect(errors).toEqual([]);
    });

    it('expires the remote wait at the remote deadline after a retried start', async () => {
        const {
            engine,
            store,
            clock,
            peers,
        } = setup({ developer: { timeoutMs: 3_600_000 }, engine: { claimTtlMs: 120_000 } });

        peers.script('start', rejectWith(new Error('down')));

        const runId = await startStandIn(engine);

        clock.advance(120_000);
        await engine.recover();
        await engine.idle();

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.WAITING);
        expect(run.waiting?.expiresAt).toEqual(new Date(REMOTE_START.getTime() + 3_600_000));
    });

    it('fails with Timeout instead of retrying a start past the remote deadline', async () => {
        const {
            engine,
            store,
            clock,
            peers,
            errors,
        } = setup({ developer: { timeoutMs: 100_000 }, engine: { claimTtlMs: 150_000 } });
        const down = new Error('down');

        peers.script('start', rejectWith(down));

        const runId = await startStandIn(engine);

        expect(errors).toEqual([down]);

        clock.advance(150_000);
        await engine.recover();
        await engine.idle();

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.FAILED);
        expect(run.error?.code).toBe('Timeout');
        expect(peers.calls.start).toHaveLength(1);
    });
});

describe('the stand-in run: registration', () => {
    const handBuilt = (definition: Record<string, unknown>) => ({
        kind: 'remote',
        name: 'developer',
        definition: {
            name: 'developer',
            peer: 'dev',
            agent: 'developer',
            role: 'default',
            timeoutMs: DAY,
            ...definition,
        },
    }) as unknown as RemoteAgent;

    it.each([
        ['a non-numeric timeoutMs', { timeoutMs: 'soon' }],
        ['no timeoutMs', { timeoutMs: undefined }],
        ['no remote agent', { agent: undefined }],
        ['a malformed role', { role: 'Not A Role' }],
        ['a model', { model: 'openai/gpt' }],
    ])('re-runs the definition checks on a hand-built remote agent with %s', async (_, definition) => {
        const { engine } = setup();

        await expect(engine.putAgent(handBuilt(definition))).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
        expect(() => engine.checkAgent(handBuilt(definition))).toThrow(InvalidAgentDefinitionError);
        // a hand-built agent with every normalized field passes
        expect(() => engine.checkAgent(handBuilt({}))).not.toThrow();
    });
});
