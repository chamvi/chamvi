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
import { Permission } from '@chamvi/access';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import type {
    ConnectionStatus,
    ConnectionWidget,
    IConnectionHandle,
} from '@chamvi/core';
import type { IShutdown } from '@chamvi/http';
import type { IAppEvent } from 'routup';
import { isStreamRequest, routeLabel } from '../../../src/plugins/helpers.ts';
import {
    ADMIN_TOKEN,
    call,
    createTestApp,
    flush,
    restricted,
    tokenFor,
} from '../../utils/app.ts';
import { SseReader } from '../../utils/sse.ts';

const QR = '2@SECRET-QR-REFERENCE,xyz';

type FakeHandle = {
    handle: IConnectionHandle;
    set(status: ConnectionStatus, widgets?: ConnectionWidget[]): void;
    listeners(): number;
    reset: ReturnType<typeof vi.fn>;
};

function fakeHandle(name: string, options: { reset?: boolean } = {}): FakeHandle {
    let status: ConnectionStatus = 'pairing';
    let widgets: ConnectionWidget[] = [{ kind: 'qr', value: QR }];
    const listeners = new Set<() => void>();
    const reset = vi.fn(async () => undefined);

    return {
        handle: {
            name,
            type: 'whatsapp',
            status: () => status,
            widgets: () => widgets.map((widget) => ({ ...widget })),
            subscribe(listener) {
                listeners.add(listener);

                return () => {
                    listeners.delete(listener);
                };
            },
            actions: options.reset === false ? {} : { reset },
        },
        set(next, nextWidgets = []) {
            status = next;
            widgets = nextWidgets;

            for (const listener of listeners) {
                listener();
            }
        },
        listeners: () => listeners.size,
        reset,
    };
}

function world(handles: FakeHandle[], overrides: Parameters<typeof createTestApp>[0] = {}) {
    return createTestApp({ connections: () => handles.map((fake) => fake.handle), ...overrides });
}

function stream(app: ReturnType<typeof world>['app'], name: string, token: string, signal?: AbortSignal) {
    return call(app, 'GET', `/connections/${name}/events`, {
        token,
        headers: { accept: 'text/event-stream' },
        ...(signal ? { signal } : {}),
    });
}

describe('connection routes', () => {
    it('lists the connections a principal may read or write, without widgets', async () => {
        const handles = [fakeHandle('alpha'), fakeHandle('beta'), fakeHandle('gamma')];
        const { app } = world(handles);

        const scoped = await call(app, 'GET', '/connections', { token: tokenFor(restricted(Permission.CONNECTION_READ, { name: 'alpha' }), restricted(Permission.CONNECTION_WRITE, { name: 'beta' })) });
        const text = await scoped.text();

        expect(scoped.status).toBe(200);
        expect(JSON.parse(text)).toEqual({
            data: [
                {
                    name: 'alpha', 
                    type: 'whatsapp', 
                    status: 'pairing', 
                },
                {
                    name: 'beta', 
                    type: 'whatsapp', 
                    status: 'pairing', 
                },
            ],
        });
        expect(text).not.toContain('SECRET-QR-REFERENCE');

        const all = await call(app, 'GET', '/connections', { token: ADMIN_TOKEN });
        const allText = await all.text();

        expect((JSON.parse(allText) as { data: unknown[] }).data).toHaveLength(3);
        expect(allText).not.toContain('SECRET-QR-REFERENCE');

        // a grant of another name lists nothing
        const wrong = await call(app, 'GET', '/connections', { token: tokenFor(Permission.CONNECTION_CREATE) });

        expect(await wrong.json()).toEqual({ data: [] });
        expect((await call(app, 'GET', '/connections')).status).toBe(401);
    });

    it('lists nothing without the connections option', async () => {
        const { app } = createTestApp();

        expect(await (await call(app, 'GET', '/connections', { token: ADMIN_TOKEN })).json()).toEqual({ data: [] });
        expect((await call(app, 'GET', '/connections/alpha', { token: ADMIN_TOKEN })).status).toBe(404);
    });

    it('refuses a connections option that is not a function', () => {
        expect(() => createTestApp({ connections: [] as never })).toThrow(InvalidAgentDefinitionError);
    });

    it('tells a writer when the connection offers no reset', async () => {
        const { app } = world([fakeHandle('beta', { reset: false })]);
        const detail = await call(app, 'GET', '/connections/beta', { token: tokenFor(restricted(Permission.CONNECTION_WRITE, { name: 'beta' })) });

        expect(await detail.json()).toMatchObject({ canReset: false });
    });

    it('shows widgets on the detail only with write', async () => {
        const { app } = world([fakeHandle('alpha')]);

        const read = await call(app, 'GET', '/connections/alpha', { token: tokenFor(restricted(Permission.CONNECTION_READ, { name: 'alpha' })) });
        const readText = await read.text();

        expect(read.status).toBe(200);
        expect(JSON.parse(readText)).toEqual({
            name: 'alpha', 
            type: 'whatsapp', 
            status: 'pairing', 
        });
        expect(readText).not.toContain('SECRET-QR-REFERENCE');

        const write = await call(app, 'GET', '/connections/alpha', { token: tokenFor(restricted(Permission.CONNECTION_WRITE, { name: 'alpha' })) });

        expect(await write.json()).toEqual({
            name: 'alpha',
            type: 'whatsapp',
            status: 'pairing',
            widgets: [{ kind: 'qr', value: QR }],
            canReset: true,
            live: true,
        });

        expect((await call(app, 'GET', '/connections/alpha')).status).toBe(401);
        expect((await call(app, 'GET', '/connections/omega', { token: ADMIN_TOKEN })).status).toBe(404);
        expect((await call(app, 'GET', '/connections/alpha', { token: tokenFor(restricted(Permission.CONNECTION_WRITE, { name: 'beta' })) })).status).toBe(403);
    });

    it('a write grant restricted to one connection reads and writes only it', async () => {
        const handles = [fakeHandle('alpha'), fakeHandle('beta')];
        const { app } = world(handles);
        const token = tokenFor(restricted(Permission.CONNECTION_WRITE, { name: 'alpha' }));

        expect(await (await call(app, 'GET', '/connections', { token })).json()).toEqual({
            data: [{
                name: 'alpha',
                type: 'whatsapp',
                status: 'pairing',
            }],
        });
        expect(await (await call(app, 'GET', '/connections/alpha', { token })).json()).toMatchObject({ widgets: [{ kind: 'qr', value: QR }] });
        expect((await call(app, 'GET', '/connections/beta', { token })).status).toBe(403);
        expect((await stream(app, 'beta', token)).status).toBe(403);
        expect((await call(app, 'POST', '/connections/beta/reset', { token })).status).toBe(403);
        expect(handles[1]!.reset).not.toHaveBeenCalled();
    });

    it('a read grant restricted to one connection never reaches its QR or reset', async () => {
        const fake = fakeHandle('alpha');
        const { app } = world([fake]);
        const token = tokenFor(restricted(Permission.CONNECTION_READ, { name: 'alpha' }));
        const detail = await call(app, 'GET', '/connections/alpha', { token });

        expect(detail.status).toBe(200);
        expect(await detail.text()).not.toContain('SECRET-QR-REFERENCE');
        expect((await stream(app, 'alpha', token)).status).toBe(403);
        expect((await call(app, 'POST', '/connections/alpha/reset', { token })).status).toBe(403);
        expect(fake.reset).not.toHaveBeenCalled();
    });

    it('a grant restricted by type reaches every connection of that type', async () => {
        const { app } = world([fakeHandle('alpha'), fakeHandle('beta')]);
        const whatsapp = tokenFor(restricted(Permission.CONNECTION_READ, { type: 'whatsapp' }));
        const mail = tokenFor(restricted(Permission.CONNECTION_READ, { type: 'mail' }));

        expect((await (await call(app, 'GET', '/connections', { token: whatsapp })).json()).data).toHaveLength(2);
        expect(await (await call(app, 'GET', '/connections', { token: mail })).json()).toEqual({ data: [] });
        expect((await call(app, 'GET', '/connections/alpha', { token: mail })).status).toBe(403);
    });

    it('answers 403 whether or not the connection exists', async () => {
        const { app } = world([fakeHandle('alpha')]);
        const token = tokenFor(restricted(Permission.CONNECTION_READ, { name: 'beta' }));

        for (const name of ['alpha', 'omega']) {
            expect((await call(app, 'GET', `/connections/${name}`, { token })).status).toBe(403);
            expect((await stream(app, name, token)).status).toBe(403);
            expect((await call(app, 'POST', `/connections/${name}/reset`, { token })).status).toBe(403);
        }
    });

    it('shows a declared connection with no handle as disconnected', async () => {
        const provider = {
            definition: {
                type: 'mail',
                label: 'Mail',
                multiple: true,
                fields: [],
            },
            creatable: () => false,
            connections: () => [{
                name: 'mail-work', 
                account: 'work', 
                resolved: { state: 'configured' }, 
            }],
        };
        const { app } = world([], { connectionTypes: () => [provider as never] });

        expect(await (await call(app, 'GET', '/connections/mail-work', { token: tokenFor(restricted(Permission.CONNECTION_READ, { name: 'mail-work' })) })).json()).toMatchObject({
            name: 'mail-work',
            type: 'mail',
            status: 'disconnected',
        });

        const written = await (await call(app, 'GET', '/connections/mail-work', { token: tokenFor(restricted(Permission.CONNECTION_WRITE, { name: 'mail-work' })) })).json() as Record<string, unknown>;

        expect(written).toMatchObject({
            status: 'disconnected',
            widgets: [],
            canReset: false,
            live: false,
        });
        expect((await call(app, 'GET', '/connections/mail-other', { token: ADMIN_TOKEN })).status).toBe(404);
        expect((await stream(app, 'mail-work', ADMIN_TOKEN)).status).toBe(404);
    });

    it('marks a connection with a handle as live for a writer', async () => {
        const { app } = world([fakeHandle('alpha')]);

        expect(await (await call(app, 'GET', '/connections/alpha', { token: ADMIN_TOKEN })).json()).toMatchObject({ live: true });
    });

    it('streams status and widget changes to a writer', async () => {
        const fake = fakeHandle('alpha');
        const { app } = world([fake]);

        expect((await stream(app, 'alpha', tokenFor(restricted(Permission.CONNECTION_READ, { name: 'alpha' })))).status).toBe(403);
        expect((await stream(app, 'omega', ADMIN_TOKEN)).status).toBe(404);

        const controller = new AbortController();
        const response = await stream(app, 'alpha', tokenFor(restricted(Permission.CONNECTION_WRITE, { name: 'alpha' })), controller.signal);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toMatch(/text\/event-stream/);

        const reader = new SseReader(response);

        expect(await reader.next(2)).toEqual([
            { event: 'status', data: JSON.stringify({ status: 'pairing' }) },
            { event: 'widgets', data: JSON.stringify({ widgets: [{ kind: 'qr', value: QR }] }) },
        ]);

        fake.set('connected');

        expect(await reader.next(2)).toEqual([
            { event: 'status', data: JSON.stringify({ status: 'connected' }) },
            { event: 'widgets', data: JSON.stringify({ widgets: [] }) },
        ]);

        // a change of the status alone sends the status alone
        fake.set('disconnected');
        fake.set('connecting');

        expect(await reader.next(2)).toEqual([
            { event: 'status', data: JSON.stringify({ status: 'disconnected' }) },
            { event: 'status', data: JSON.stringify({ status: 'connecting' }) },
        ]);

        controller.abort();
        await flush();
        expect(fake.listeners()).toBe(0);
    });

    it('pings an idle stream on the clock', async () => {
        const fake = fakeHandle('alpha');
        const { app, clock } = world([fake], { stream: { pollMs: 1000 } });
        const controller = new AbortController();
        const reader = new SseReader(await stream(app, 'alpha', ADMIN_TOKEN, controller.signal));

        await reader.next(2);
        clock.advance(1000);

        expect(await reader.next(1)).toEqual([{ event: 'ping', data: '' }]);
        controller.abort();
    });

    it('counts a stream against stream.maxOpen and ends it on shutdown', async () => {
        const fake = fakeHandle('alpha');
        const hooks: Array<() => void | Promise<void>> = [];
        const shutdown: IShutdown = {
            shuttingDown: false,
            onShutdown(fn) {
                hooks.push(fn);

                return () => undefined;
            },
            async shutdown() {
                for (const hook of hooks) {
                    await hook();
                }
            },
        };
        const { app } = world([fake], { stream: { maxOpen: 1 }, shutdown });
        const reader = new SseReader(await stream(app, 'alpha', ADMIN_TOKEN));

        await reader.next(2);

        const refused = await stream(app, 'alpha', ADMIN_TOKEN);

        expect(refused.status).toBe(503);
        expect(refused.headers.get('retry-after')).toBe('5');

        await shutdown.shutdown();
        expect(await reader.rest()).toEqual([]);
        expect(fake.listeners()).toBe(0);
    });

    it('keeps a connection detail out of every cache', async () => {
        const { app } = world([fakeHandle('alpha')]);
        const response = await call(app, 'GET', '/connections/alpha', { token: ADMIN_TOKEN });

        expect(response.headers.get('cache-control')).toBe('private, no-store');
    });

    it('keeps the 404 of a connection detail out of every cache', async () => {
        const { app } = world([fakeHandle('alpha')]);
        const response = await call(app, 'GET', '/connections/nope', { token: ADMIN_TOKEN });

        expect(response.status).toBe(404);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
    });

    it('keeps the 403 of a connection detail out of every cache', async () => {
        const { app } = world([fakeHandle('alpha')]);
        const response = await call(app, 'GET', '/connections/alpha', { token: tokenFor(Permission.RUN_READ) });

        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
    });

    it('gives the stream slot back when the subscription fails', async () => {
        const fake = fakeHandle('alpha');
        const { subscribe } = fake.handle;
        let fail = true;
        const flaky: FakeHandle = {
            ...fake,
            handle: {
                ...fake.handle,
                subscribe(listener) {
                    if (fail) {
                        fail = false;

                        throw new Error('subscribe failed');
                    }

                    return subscribe(listener);
                },
            },
        };
        const { app } = world([flaky], { stream: { maxOpen: 1 }, onError: () => undefined });

        expect((await stream(app, 'alpha', ADMIN_TOKEN)).status).toBe(500);

        const controller = new AbortController();
        const retried = await stream(app, 'alpha', ADMIN_TOKEN, controller.signal);

        expect(retried.status).toBe(200);
        controller.abort();
    });

    it('gives the stream slot back when the unsubscribe throws, and reports it', async () => {
        const fake = fakeHandle('alpha');
        const failure = new Error('unsubscribe failed');
        const onError = vi.fn();
        const throwing: FakeHandle = {
            ...fake,
            handle: {
                ...fake.handle,
                subscribe: () => () => {
                    throw failure;
                },
            },
        };
        const { app } = world([throwing], { stream: { maxOpen: 1 }, onError });
        const first = new AbortController();
        const reader = new SseReader(await stream(app, 'alpha', ADMIN_TOKEN, first.signal));

        await reader.next(2);
        first.abort();
        await flush();
        expect(onError).toHaveBeenCalledWith(failure);

        const second = new AbortController();
        const retried = await stream(app, 'alpha', ADMIN_TOKEN, second.signal);

        expect(retried.status).toBe(200);
        second.abort();
        await flush();
    });

    it('reset needs write and calls the handle', async () => {
        const fake = fakeHandle('alpha');
        const bare = fakeHandle('beta', { reset: false });
        const { app } = world([fake, bare]);

        expect((await call(app, 'POST', '/connections/alpha/reset', { token: tokenFor(restricted(Permission.CONNECTION_READ, { name: 'alpha' })) })).status).toBe(403);
        expect(fake.reset).not.toHaveBeenCalled();

        const response = await call(app, 'POST', '/connections/alpha/reset', { token: tokenFor(restricted(Permission.CONNECTION_WRITE, { name: 'alpha' })) });

        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({
            name: 'alpha', 
            type: 'whatsapp', 
            status: 'pairing', 
        });
        expect(fake.reset).toHaveBeenCalledTimes(1);

        expect((await call(app, 'POST', '/connections/beta/reset', { token: ADMIN_TOKEN })).status).toBe(404);
        expect((await call(app, 'POST', '/connections/omega/reset', { token: ADMIN_TOKEN })).status).toBe(404);
        expect((await call(app, 'POST', '/connections/alpha/reset')).status).toBe(401);
    });

    it('reset answers 202 at once and reports a rejection through onError', async () => {
        const fake = fakeHandle('alpha');
        const errors: unknown[] = [];
        const { app } = world([fake], {
            onError: (error) => {
                errors.push(error);
            },
        });
        const pending = Promise.withResolvers<undefined>();

        fake.reset.mockImplementationOnce(() => pending.promise);

        const response = await call(app, 'POST', '/connections/alpha/reset', { token: tokenFor(restricted(Permission.CONNECTION_WRITE, { name: 'alpha' })) });

        expect(response.status).toBe(202);
        expect(fake.reset).toHaveBeenCalledTimes(1);

        const failure = new Error('the reset failed');

        pending.reject(failure);
        await flush();
        expect(errors).toEqual([failure]);
    });

    it('reset while held elsewhere answers 409 and calls nothing', async () => {
        const fake = fakeHandle('alpha');
        const { app } = world([fake]);

        fake.set('held_elsewhere');

        const response = await call(app, 'POST', '/connections/alpha/reset', { token: tokenFor(restricted(Permission.CONNECTION_WRITE, { name: 'alpha' })) });
        const body = await response.json() as { message?: string };

        expect(response.status).toBe(409);
        expect(body.message).toMatch(/held by another process/);
        expect(fake.reset).not.toHaveBeenCalled();
    });

    it('labels the connection routes in metrics and keeps their stream out of the timings', () => {
        const event = (method: string, path: string) => ({ method, path }) as IAppEvent;

        expect(routeLabel(event('GET', '/connections'), '', '/metrics')).toBe('/connections');
        expect(routeLabel(event('GET', '/connections/alpha'), '', '/metrics')).toBe('/connections/:name');
        expect(routeLabel(event('GET', '/connections/alpha/events'), '', '/metrics')).toBe('/connections/:name/events');
        expect(routeLabel(event('POST', '/connections/alpha/reset'), '', '/metrics')).toBe('/connections/:name/reset');
        expect(routeLabel(event('GET', '/connections/alpha/config'), '', '/metrics')).toBe('/connections/:name/config');
        expect(routeLabel(event('POST', '/connections/alpha/test'), '', '/metrics')).toBe('/connections/:name/test');
        expect(routeLabel(event('POST', '/connection-types/mail/connections'), '', '/metrics')).toBe('/connection-types/:type/connections');
        expect(routeLabel(event('GET', '/ui-pages'), '', '/metrics')).toBe('/ui-pages');
        expect(isStreamRequest(event('GET', '/connections/alpha/events'), '')).toBe(true);
    });

    it('reserves the connections segment for the built-in routes', () => {
        expect(() => createTestApp({
            routes: [{
                method: 'GET',
                path: '/connections',
                handler: async () => ({ status: 200 }),
            }],
        })).toThrow(InvalidAgentDefinitionError);
    });
});
