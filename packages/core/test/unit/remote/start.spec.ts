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
import { ValidationError } from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
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

afterEach(() => {
    for (const e of engines) {
        e.stop();
    }

    engines.length = 0;
});

function setup(...args: Parameters<typeof setupRemote>) {
    const ctx = setupRemote(...args);

    engines.push(ctx.engine);

    return ctx;
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
                depth: 1,
            },
            taint: false,
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

        engine.stop();

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
});
