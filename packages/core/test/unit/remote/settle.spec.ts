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
import { ValidationError } from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import { RunStatus } from '@chamvi/store';
import type { Run } from '@chamvi/store';
import { readRemoteOutcome, remoteOutcomeOf } from '../../../src/engine/remote/helpers/index.ts';
import { peerRunView } from '../../utils/peers.ts';
import type { RemoteOutcome } from '../../../src/engine/remote/types.ts';
import { REMOTE_ERROR_CODE_MAX_LENGTH, REMOTE_ERROR_MESSAGE_MAX_LENGTH } from '../../../src/engine/remote/constants.ts';
import {
    readRun,
    setupRemote,
    startStandIn,
} from '../../utils/remote.ts';

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((e) => e.stop()));

    engines.length = 0;
});

function setup(...args: Parameters<typeof setupRemote>) {
    const ctx = setupRemote(...args);

    engines.push(ctx.engine);
    ctx.peers.script('start', { runId: 'r1' });

    return ctx;
}

function outcome(patch: Partial<RemoteOutcome>): RemoteOutcome {
    return {
        status: 'completed',
        tainted: false,
        usage: { inputTokens: 0, outputTokens: 0 },
        ...patch,
    };
}

describe('the stand-in run: settle', () => {
    it('completes with the remote output and usage', async () => {
        const {
            engine,
            store,
            peers,
        } = setup();
        const runId = await startStandIn(engine);

        expect(await engine.answerRemote(runId, outcome({
            output: { ok: true },
            usage: { inputTokens: 4, outputTokens: 2 },
        }))).toBe(true);
        await engine.idle();

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.COMPLETED);
        expect(run.output).toEqual({ ok: true });
        expect(run.usage).toEqual({ inputTokens: 4, outputTokens: 2 });
        expect(run.waiting).toBeUndefined();
        expect(run.taint).toBeUndefined();
        // the settling execution makes no network call
        expect(peers.calls.start).toHaveLength(1);
        expect(peers.calls.read).toHaveLength(0);

        const steps = await store.stepService.find(runId);

        expect(steps.map((step) => step.kind)).toEqual(['wait']);
        expect(steps[0]).toMatchObject({
            name: 'remote',
            input: {
                peer: 'dev',
                agent: 'developer',
                remoteRunId: 'r1',
            },
            output: { status: 'completed' },
        });
    });

    it('answers a remote wait once', async () => {
        const { engine } = setup();
        const runId = await startStandIn(engine);

        expect(await engine.answerRemote(runId, outcome({}))).toBe(true);
        expect(await engine.answerRemote(runId, outcome({}))).toBe(false);
        await engine.idle();
        expect(await engine.answerRemote(runId, outcome({}))).toBe(false);
    });

    it('validates the output against the agent output schema', async () => {
        const { engine, store } = setup({ developer: { output: z.object({ ok: z.boolean() }) } });
        const runId = await startStandIn(engine);

        await engine.answerRemote(runId, outcome({ output: { ok: 'yes' } }));
        await engine.idle();

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.FAILED);
        expect(run.error?.code).toBe('validation_error');
        expect(run.output).toBeUndefined();
    });

    it('stores the parsed output of a matching schema', async () => {
        const { engine, store } = setup({ developer: { output: z.object({ ok: z.boolean() }) } });
        const runId = await startStandIn(engine);

        await engine.answerRemote(runId, outcome({ output: { ok: true, extra: 1 } }));
        await engine.idle();

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.COMPLETED);
        expect(run.output).toEqual({ ok: true });
    });

    it('fails with the remote error', async () => {
        const { engine, store } = setup();
        const runId = await startStandIn(engine);

        await engine.answerRemote(runId, outcome({
            status: 'failed',
            error: { code: 'tool_denied', message: 'Denied.' },
            usage: { inputTokens: 1, outputTokens: 1 },
        }));
        await engine.idle();

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.FAILED);
        expect(run.error).toEqual({ code: 'tool_denied', message: 'Denied.' });
        expect(run.usage).toEqual({ inputTokens: 1, outputTokens: 1 });
    });

    it('cancels with a cancelled remote run', async () => {
        const { engine, store } = setup();
        const runId = await startStandIn(engine);

        await engine.answerRemote(runId, outcome({ status: 'cancelled' }));
        await engine.idle();

        expect((await readRun(store, runId)).status).toBe(RunStatus.CANCELLED);
    });

    it('fails with Timeout on a timed-out remote wait', async () => {
        const { engine, store } = setup();
        const runId = await startStandIn(engine);

        await engine.answerRemote(runId, outcome({ status: 'timeout' }));
        await engine.idle();

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.FAILED);
        expect(run.error?.code).toBe('Timeout');
    });

    it.each([
        ['the remote run was tainted', { tainted: true }, {}],
        ['the peer is untrusted', { tainted: false }, { untrusted: true }],
    ])('taints the run before the output when %s', async (_name, patch, settings) => {
        const { engine, store } = setup({ peers: { dev: settings } });
        const runId = await startStandIn(engine);
        const updates: Run[] = [];

        engine.on('run.updated', ({ run }) => {
            if (run.id === runId) {
                updates.push(run);
            }
        });

        await engine.answerRemote(runId, outcome({ ...patch, output: 'secret' }));
        await engine.idle();

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.COMPLETED);
        expect(run.taint?.source).toBe('peer:dev/r1');
        expect(run.taint?.at).toBeInstanceOf(Date);

        const tainted = updates.findIndex((update) => update.taint !== undefined);
        const completed = updates.findIndex((update) => update.status === RunStatus.COMPLETED);

        expect(tainted).toBeGreaterThanOrEqual(0);
        expect(updates[tainted]!.status).toBe(RunStatus.RUNNING);
        expect(updates[tainted]!.output).toBeUndefined();
        expect(tainted).toBeLessThan(completed);
    });

    it('keeps an inherited taint', async () => {
        const { engine, store } = setup();

        await engine.start();

        const { runId: alfredId } = await engine.dispatch({
            agent: 'alfred',
            trigger: 'test',
            channel: 'web',
            payload: 'go',
        });

        await engine.idle();

        const { data: [standIn] } = await store.runService.find({ parentRunId: alfredId });

        await engine.answerRemote(standIn!.id, outcome({ tainted: true }));
        await engine.idle();

        expect((await readRun(store, standIn!.id)).taint?.source).toBe('channel:web');
    });

    it('adds the stand-in usage to the parent subtree usage', async () => {
        const { engine, store } = setup();

        await engine.start();

        const { runId: alfredId } = await engine.dispatch({
            agent: 'alfred',
            trigger: 'test',
            channel: 'test',
            payload: 'go',
        });

        await engine.idle();

        const { data: [standIn] } = await store.runService.find({ parentRunId: alfredId });

        await engine.answerRemote(standIn!.id, outcome({ usage: { inputTokens: 4, outputTokens: 2 } }));
        await engine.idle();

        expect((await readRun(store, alfredId)).subtreeUsage).toEqual({ inputTokens: 4, outputTokens: 2 });
    });

    it('fails with remote_failed when the peer reports a failure without an error', async () => {
        const {
            engine,
            store,
        } = setup();
        const runId = await startStandIn(engine);

        await engine.answerRemote(runId, outcome({ status: 'failed' }));
        await engine.idle();

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.FAILED);
        expect(run.error?.code).toBe('remote_failed');
    });

    it('fails instead of tainting with the intake source when the start record is missing', async () => {
        const {
            engine,
            store,
        } = setup();
        const runId = await startStandIn(engine);
        const findOne = store.effectService.findOne.bind(store.effectService);

        store.effectService.findOne = (key) => (key.startsWith('remote-start:') ? Promise.resolve(undefined) : findOne(key));

        await engine.answerRemote(runId, outcome({ tainted: true, output: 'secret' }));
        await engine.idle();

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.FAILED);
        expect(run.output).toBeUndefined();
        // the run fails before any taint is written: nothing is attributed to the intake source
        expect(run.taint).toBeUndefined();
    });

    it('fails a run whose recorded outcome is malformed', async () => {
        const {
            engine,
            store,
        } = setup();
        const runId = await startStandIn(engine);

        await engine.answerRemote(runId, { ...outcome({}), status: 'bogus' } as unknown as RemoteOutcome);
        await engine.idle();

        const run = await readRun(store, runId);

        expect(run.status).toBe(RunStatus.FAILED);
        expect(run.output).toBeUndefined();
    });
});

describe('readRemoteOutcome', () => {
    it('reads the four outcome statuses with a boolean taint', () => {
        for (const status of ['completed', 'failed', 'cancelled', 'timeout'] as const) {
            expect(readRemoteOutcome(outcome({ status }))).toEqual(outcome({ status }));
        }

        expect(readRemoteOutcome(undefined)).toBeUndefined();
    });

    it('throws on a malformed record', () => {
        expect(() => readRemoteOutcome({ ...outcome({}), status: 'running' })).toThrow();
        expect(() => readRemoteOutcome({ ...outcome({}), tainted: 'yes' })).toThrow();
        expect(() => readRemoteOutcome({ status: 'completed', tainted: false })).toThrow();
        expect(() => readRemoteOutcome('completed')).toThrow();
    });
});

describe('remoteOutcomeOf', () => {
    it('reads the usage of a settled view, zero without one', () => {
        expect(remoteOutcomeOf(peerRunView('r1', { status: 'completed', usage: { inputTokens: 3, outputTokens: 4 } }))?.usage)
            .toEqual({ inputTokens: 3, outputTokens: 4 });
        expect(remoteOutcomeOf({ ...peerRunView('r1', { status: 'failed' }), usage: undefined as never })?.usage)
            .toEqual({ inputTokens: 0, outputTokens: 0 });
        expect(remoteOutcomeOf(peerRunView('r1'))).toBeUndefined();
    });

    it('throws on a usage count that is not a non-negative integer', () => {
        for (const count of [-1, 1.5, NaN, Infinity, '7', null]) {
            const view = peerRunView('r1', { status: 'completed', usage: { inputTokens: count as number, outputTokens: 0 } });

            expect(() => remoteOutcomeOf(view)).toThrow(ValidationError);
        }

        expect(() => remoteOutcomeOf({ ...peerRunView('r1', { status: 'completed' }), usage: 'none' as never })).toThrow(ValidationError);
    });

    it('throws on an error without a string code and message', () => {
        for (const error of ['boom', { code: 1, message: 'x' }, { code: 'x' }]) {
            expect(() => remoteOutcomeOf(peerRunView('r1', { status: 'failed', error: error as never }))).toThrow(ValidationError);
        }
    });

    it('cuts a long error code and message', () => {
        const outcome = remoteOutcomeOf(peerRunView('r1', {
            status: 'failed',
            error: { code: 'c'.repeat(500), message: 'm'.repeat(10_000) },
        }));

        expect(outcome?.error?.code).toHaveLength(REMOTE_ERROR_CODE_MAX_LENGTH);
        expect(outcome?.error?.message).toBe(`${'m'.repeat(REMOTE_ERROR_MESSAGE_MAX_LENGTH)}…`);
    });
});
