/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { ChannelStatus, IChannel } from '@chamvi/core';
import type { HttpComponent } from '@chamvi/http';
import {
    ADMIN_TOKEN,
    READER_TOKEN,
    call,
    createTestApp,
    restricted,
    tokenFor,
} from '../../utils/app.ts';
import { createTestController } from '../../utils/controllers.ts';
import { pathLabels } from '../../utils/metrics.ts';

const T0 = Date.parse('2026-03-01T08:00:00.000Z');

function component(name: string, status: () => ChannelStatus): HttpComponent {
    return { name, status };
}

function reporting(name: string, status: () => ChannelStatus): IChannel {
    return { name, status };
}

async function list(app: ReturnType<typeof createTestApp>['app'], token?: string) {
    const response = await call(app, 'GET', '/components', { token });

    return { response, body: await response.json() as Record<string, unknown> };
}

describe('GET /components', () => {
    it('answers 401 without a token', async () => {
        const { app } = createTestApp();

        expect((await list(app)).response.status).toBe(401);
    });

    it('answers 403 without chamvi_component_read', async () => {
        const { app } = createTestApp({ components: () => [component('store-purge', () => ({}))] });
        const reader = await list(app, READER_TOKEN);

        expect(reader.response.status).toBe(403);
        expect(reader.body.message).toContain(Permission.COMPONENT_READ);
        expect((await list(app, tokenFor(Permission.AGENT_READ))).response.status).toBe(403);
    });

    it('lists only the components a restricted grant covers', async () => {
        const { app } = createTestApp({
            engineChannels: [reporting('ticker', () => ({}))],
            components: () => [
                component('store-purge', () => ({})),
                component('cron', () => ({})),
            ],
        });
        const byName = await list(app, tokenFor(restricted(Permission.COMPONENT_READ, { name: 'cron' })));

        expect(byName.response.status).toBe(200);
        expect(byName.body).toEqual({ data: [{ name: 'cron', kind: 'job' }] });

        const byKind = await list(app, tokenFor(restricted(Permission.COMPONENT_READ, { kind: 'channel' })));

        expect(byKind.response.status).toBe(200);
        expect(byKind.body).toEqual({ data: [{ name: 'ticker', kind: 'channel' }] });
    });

    it('lists the jobs in the given order, then the channels with a status(), with ISO times', async () => {
        const { app } = createTestApp({
            engineChannels: [
                reporting('ticker', () => ({ lastSuccessAt: T0, runningSince: T0 + 60_000 })),
                { name: 'silent' },
            ],
            components: () => [
                component('store-purge', () => ({
                    lastSuccessAt: T0,
                    lastErrorAt: T0 + 1_000,
                    lastRunAt: T0 + 1_000,
                })),
                component('agents-watcher', () => ({})),
            ],
        });
        const result = await list(app, tokenFor(Permission.COMPONENT_READ));

        expect(result.response.status).toBe(200);
        expect(result.body).toEqual({
            data: [
                {
                    name: 'store-purge',
                    kind: 'job',
                    lastSuccessAt: '2026-03-01T08:00:00.000Z',
                    lastErrorAt: '2026-03-01T08:00:01.000Z',
                    lastRunAt: '2026-03-01T08:00:01.000Z',
                },
                { name: 'agents-watcher', kind: 'job' },
                {
                    name: 'ticker',
                    kind: 'channel',
                    lastSuccessAt: '2026-03-01T08:00:00.000Z',
                    runningSince: '2026-03-01T08:01:00.000Z',
                },
            ],
        });
    });

    it('reads the components per request', async () => {
        let jobs: HttpComponent[] = [];
        const { app } = createTestApp({ components: () => jobs });

        expect((await list(app, ADMIN_TOKEN)).body).toEqual({ data: [] });

        jobs = [component('late', () => ({ lastRunAt: T0 }))];
        expect((await list(app, ADMIN_TOKEN)).body).toEqual({
            data: [{
                name: 'late',
                kind: 'job',
                lastRunAt: '2026-03-01T08:00:00.000Z',
            }],
        });
    });

    it('lists an entry whose status() throws without times and reports the error', async () => {
        const errors: unknown[] = [];
        const jobFailure = new Error('job status failed');
        const channelFailure = new Error('channel status failed');
        const { app } = createTestApp({
            engineChannels: [reporting('broken', () => {
                throw channelFailure;
            })],
            components: () => [
                component('failing', () => {
                    throw jobFailure;
                }),
                component('fine', () => ({ lastRunAt: T0 })),
            ],
            onError: (error) => {
                errors.push(error);
            },
        });
        const result = await list(app, ADMIN_TOKEN);

        expect(result.response.status).toBe(200);
        expect(result.body).toEqual({
            data: [
                { name: 'failing', kind: 'job' },
                {
                    name: 'fine',
                    kind: 'job',
                    lastRunAt: '2026-03-01T08:00:00.000Z',
                },
                { name: 'broken', kind: 'channel' },
            ],
        });
        expect(errors).toEqual([jobFailure, channelFailure]);
    });

    it('leaves out a time no date holds', async () => {
        const { app } = createTestApp({
            components: () => [component('odd', () => ({
                lastSuccessAt: NaN,
                lastErrorAt: Infinity,
                lastRunAt: 1e20,
                runningSince: T0,
            }))],
        });

        expect((await list(app, ADMIN_TOKEN)).body).toEqual({
            data: [{
                name: 'odd',
                kind: 'job',
                runningSince: '2026-03-01T08:00:00.000Z',
            }],
        });
    });

    it('lists an entry whose status() returns no object without times', async () => {
        const errors: unknown[] = [];
        const { app } = createTestApp({
            components: () => [
                component('empty', () => undefined as unknown as ChannelStatus),
                component('null', () => null as unknown as ChannelStatus),
            ],
            onError: (error) => {
                errors.push(error);
            },
        });
        const { response, body } = await list(app, ADMIN_TOKEN);

        expect(response.status).toBe(200);
        expect(body).toEqual({ data: [{ name: 'empty', kind: 'job' }, { name: 'null', kind: 'job' }] });
        expect(errors).toEqual([]);
    });

    it('answers an empty list without components and without a channel that reports a status', async () => {
        const { app } = createTestApp();
        const result = await list(app, ADMIN_TOKEN);

        expect(result.response.status).toBe(200);
        expect(result.body).toEqual({ data: [] });
    });

    it('refuses a components option that is not a function', () => {
        expect(() => createTestApp({ components: [] as never })).toThrow(InvalidAgentDefinitionError);
    });

    it('refuses an extra route or a contributed controller under /components', () => {
        expect(() => createTestApp({
            routes: [{
                method: 'GET',
                path: '/components/extra',
                handler: async () => ({ status: 200 }),
            }],
        })).toThrow(/collides with a built-in route/);
        expect(() => createTestApp({ controllers: [createTestController('/components', [['GET', '']])] }))
            .toThrow(/collides with a built-in route/);
    });

    it('labels the route /components in the metrics', async () => {
        const { app } = createTestApp({ metrics: undefined });

        await (await call(app, 'GET', '/components', { token: ADMIN_TOKEN })).arrayBuffer();

        expect(await pathLabels(app)).toContain('/components');
    });
});
