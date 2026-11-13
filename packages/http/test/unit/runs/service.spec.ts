/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { z } from 'zod';
import { Permission } from '@chamvi/access';
import { ErrorCode, defineModelAgent } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { http } from '@chamvi/http';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { createLiveAgents } from '../../../src/app/helpers.ts';
import { KEY_MAX_LENGTH } from '../../../src/request/constants.ts';
import { RunService } from '../../../src/runs/service.ts';
import type { StartRunBody } from '../../../src/runs/types.ts';
import { createRunAgents, createTestApp, restricted } from '../../utils/app.ts';
import { textModel } from '../../utils/model.ts';
import { principalOf } from '../../utils/principal.ts';

const admin = principalOf(
    Permission.AGENT_RUN,
    Permission.AGENT_READ,
    Permission.AGENT_APPROVE,
    Permission.RUN_READ,
    Permission.RUN_CANCEL,
);

function setup(extra: Agent[] = []) {
    const { engine } = createTestApp({
        agents: [
            ...createRunAgents(),
            defineModelAgent({
                name: 'secret',
                model: textModel(),
                instructions: 'Secret.',
                channels: [http.on()],
                private: true,
            }),
            defineModelAgent({
                name: 'strict',
                model: textModel(),
                instructions: 'Strict.',
                channels: [http.on({ schema: z.object({ n: z.number() }) })],
            }),
            ...extra,
        ],
    });
    const service = new RunService({
        engine,
        store: engine.store,
        agents: createLiveAgents(engine),
        clock: engine.clock,
    });

    return { engine, service };
}

describe('RunService.start', () => {
    it('needs chamvi_agent_run, then answers 404 for an unknown agent', async () => {
        const { service } = setup();

        await expect(service.start({ agent: 'echo', data: {} }, principalOf(Permission.RUN_READ))).rejects.toMatchObject({
            status: 403,
            message: 'Missing permission "chamvi_agent_run".',
        });
        await expect(service.start({ agent: 'nope', data: {} }, principalOf(Permission.RUN_READ))).rejects.toMatchObject({ status: 403 });
        await expect(service.start({ agent: 'nope', data: {} }, admin)).rejects.toMatchObject({ status: 404 });
    });

    it('answers 404 for an agent without an http subscription', async () => {
        const { service } = setup();

        await expect(service.start({ agent: 'sweep', data: {} }, admin)).rejects.toMatchObject({
            status: 404,
            message: 'Agent "sweep" has no http subscription.',
        });
    });

    it('answers 400 with issues for a payload the subscription schema refuses', async () => {
        const { service } = setup();
        const error = await service.start({ agent: 'strict', data: { payload: { n: 'x' } } }, admin).catch((e: unknown) => e) as {
            status: number;
            issues: unknown[];
        };

        expect(error.status).toBe(400);
        expect(error.issues.length).toBeGreaterThan(0);
    });

    it('dispatches on the http channel with the invoker', async () => {
        const { engine, service } = setup();
        const result = await service.start({ agent: 'echo', data: { payload: { n: 1 } } }, admin);

        expect(result).toEqual({ runId: expect.any(String), deduplicated: false });

        const run = await engine.store.runs.findOne(result.runId);

        expect(run?.trigger).toMatchObject({
            channel: 'http',
            payload: { n: 1 },
            invoker: { id: 'p', kind: 'token' },
        });
    });

    it('prefers the body idempotencyKey over the header', async () => {
        const { engine, service } = setup();
        const dispatch = vi.spyOn(engine, 'dispatch');

        await service.start({
            agent: 'echo',
            data: { idempotencyKey: 'body' },
            idempotencyHeader: 'header',
        }, admin);
        await service.start({
            agent: 'echo',
            data: {},
            idempotencyHeader: 'header',
        }, admin);
        await service.start({
            agent: 'echo',
            data: {},
            idempotencyHeader: null,
        }, admin);

        expect(dispatch.mock.calls[0]?.[0].idempotencyKey).toBe('body');
        expect(dispatch.mock.calls[1]?.[0].idempotencyKey).toBe('header');
        expect(dispatch.mock.calls[2]?.[0]).not.toHaveProperty('idempotencyKey');
    });

    it('refuses a header key over the length limit', async () => {
        const { service } = setup();

        await expect(service.start({
            agent: 'echo',
            data: {},
            idempotencyHeader: 'k'.repeat(KEY_MAX_LENGTH + 1),
        }, admin))
            .rejects.toMatchObject({ status: 400 });
        await expect(service.start({
            agent: 'echo',
            data: {},
            idempotencyHeader: '',
        }, admin))
            .rejects.toMatchObject({ status: 400 });
    });

    it('passes attachments only when there are some', async () => {
        const { engine, service } = setup();
        const dispatch = vi.spyOn(engine, 'dispatch');

        await service.start({ agent: 'echo', data: { attachments: [] } }, admin);
        await service.start({
            agent: 'echo',
            // the untrusted body carries base64, the validator decodes it
            data: { attachments: [{ mediaType: 'text/plain', data: 'aGk=' }] as unknown as StartRunBody['attachments'] },
        }, admin);

        expect(dispatch.mock.calls[0]?.[0]).not.toHaveProperty('attachments');
        expect(dispatch.mock.calls[1]?.[0].attachments).toHaveLength(1);
    });

    it('checks a replacement made while the payload is validated and starts nothing for it', async () => {
        let replace: (() => Promise<void>) | undefined;
        const schema: StandardSchemaV1 = {
            '~standard': {
                version: 1,
                vendor: 'test',
                validate: async (value) => {
                    await replace?.();
                    replace = undefined;

                    return { value };
                },
            },
        };
        const { engine, service } = setup([defineModelAgent({
            name: 'swap',
            model: textModel(),
            instructions: 'Swap.',
            channels: [http.on({ schema })],
        })]);
        const dispatch = vi.spyOn(engine, 'dispatch');

        replace = async () => {
            await engine.putAgent(defineModelAgent({
                name: 'swap',
                model: textModel(),
                instructions: 'Now private.',
                channels: [http.on()],
                private: true,
            }));
        };

        const runner = principalOf(restricted(Permission.AGENT_RUN, { private: false }));

        await expect(service.start({ agent: 'swap', data: { payload: { n: 1 } } }, runner)).rejects.toMatchObject({ status: 403 });
        expect(dispatch).not.toHaveBeenCalled();
        expect((await engine.store.runs.find({})).data).toEqual([]);
    });
});

describe('RunService reads', () => {
    it('getReadable: 404 for a protected agent\'s run, else 403', async () => {
        const { service } = setup();
        const secret = await service.start({ agent: 'secret', data: {} }, admin);
        const echo = await service.start({ agent: 'echo', data: {} }, admin);
        const stranger = principalOf(Permission.STATE_READ);

        await expect(service.getReadable(secret.runId, stranger)).rejects.toMatchObject({ code: ErrorCode.RUN_NOT_FOUND });
        await expect(service.getReadable(echo.runId, stranger)).rejects.toMatchObject({ status: 403 });
        await expect(service.getReadable('missing', admin)).rejects.toMatchObject({ code: ErrorCode.RUN_NOT_FOUND });
        expect((await service.getReadable(echo.runId, admin)).id).toBe(echo.runId);
    });

    it('get adds the steps; list pages the readable runs', async () => {
        const { service } = setup();
        const { runId } = await service.start({ agent: 'echo', data: {} }, admin);

        expect(await service.get(runId, admin)).toMatchObject({
            id: runId,
            agentPrivate: false,
            steps: [],
        });
        expect(await service.list(new URLSearchParams(), admin)).toMatchObject({
            data: [{ id: runId }],
            meta: {
                total: 1,
                limit: expect.any(Number),
                offset: 0,
            },
        });
    });
});

describe('RunService.cancel', () => {
    it('surfaces the engine\'s 404 for a missing run', async () => {
        const { service } = setup();

        await expect(service.cancel('missing', admin)).rejects.toMatchObject({ code: ErrorCode.RUN_NOT_FOUND });
    });

    it('needs chamvi_run_cancel for the run\'s agent', async () => {
        const { service } = setup();
        const { runId } = await service.start({ agent: 'echo', data: {} }, admin);

        await expect(service.cancel(runId, principalOf(Permission.RUN_READ))).rejects.toMatchObject({ status: 403 });
        await expect(service.cancel(runId, principalOf(restricted(Permission.RUN_CANCEL, { agent: 'gate' }))))
            .rejects.toMatchObject({ status: 403 });
        expect(await service.cancel(runId, admin)).toEqual({ runId, status: 'cancelled' });
    });
});

describe('RunService.approve', () => {
    it('answers 404 for an unknown run before 403', async () => {
        const { service } = setup();

        await expect(service.approve('unknown', { approvalId: 'a', approved: true }, principalOf(Permission.RUN_READ)))
            .rejects.toMatchObject({ code: ErrorCode.RUN_NOT_FOUND });
    });

    it('needs chamvi_agent_approve before validating the body', async () => {
        const { service } = setup();
        const { runId } = await service.start({ agent: 'echo', data: {} }, admin);

        await expect(service.approve(runId, {} as never, principalOf(Permission.RUN_READ))).rejects.toMatchObject({
            status: 403,
            message: 'Missing permission "chamvi_agent_approve".',
        });
    });
});
