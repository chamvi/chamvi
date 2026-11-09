/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// @vitest-environment happy-dom

import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { createApp, shallowRef } from 'vue';
import type { App } from 'vue';
import { APP_CONTEXT } from '@chamvi/ui-kit';
import type { AppContext, ConnectionDetailWire } from '@chamvi/ui-kit';
import Page from '../../app/App.vue';

const QR_VALUE = '2@secret-pairing-material';

const PAIRING = {
    name: 'wa',
    type: 'whatsapp',
    status: 'pairing',
    canReset: true,
    widgets: [{ kind: 'qr', value: QR_VALUE }],
} as ConnectionDetailWire;

const flush = (ms = 10) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

let mounted: App | undefined;

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
});

type Call = { method: string; url: string };

async function mount(options: {
    permissions: string[];
    connections?: Array<{
        name: string; 
        type: string; 
        status: string 
    }> 
}) {
    const calls: Call[] = [];
    let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
    const send = async (url: string, init: { method?: string } = {}) => {
        const method = init.method ?? 'GET';

        calls.push({ method, url });

        if (url === '/connections/wa/events') {
            return new Response(new ReadableStream<Uint8Array>({
                start(controller) {
                    stream = controller;
                },
            }));
        }

        const body: Record<string, unknown> = {
            '/ui-pages': { data: [] },
            '/connection-types': { data: [] },
            '/connections': {
                data: options.connections ?? [
                    {
                        name: 'wa',
                        type: 'whatsapp',
                        status: 'pairing',
                    },
                    {
                        name: 'other',
                        type: 'mail',
                        status: 'connected',
                    },
                ],
            },
            '/connections/wa': PAIRING,
            '/connections/wa/reset': { ...PAIRING, widgets: undefined },
        };

        if (!(url in body)) {
            throw new Error(`unrouted ${method} ${url}`);
        }

        return new Response(JSON.stringify(body[url]));
    };
    const root = document.createElement('div');

    document.body.append(root);

    const app = createApp(Page);

    app.provide(APP_CONTEXT, {
        config: {
            apiBase: '', 
            uiBase: '/ui', 
            auth: { tokens: true }, 
        },
        client: { send },
        session: {
            principal: shallowRef({
                id: 'a',
                kind: 'token',
                permissions: options.permissions,
            }),
        },
    } as unknown as AppContext);
    app.mount(root);
    mounted = app;
    await flush();

    return {
        root,
        calls,
        emit: async (event: string, data: unknown) => {
            stream?.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            await flush();
        },
        testId: (id: string) => root.querySelector<HTMLElement>(`[data-testid="${CSS.escape(id)}"]`),
    };
}

describe('the WhatsApp page', () => {
    it('lists only WhatsApp connections, from GET /connections', async () => {
        const { root } = await mount({ permissions: ['*'] });

        expect(root.querySelector('[data-account="wa"]')).not.toBeNull();
        expect(root.querySelector('[data-account="other"]')).toBeNull();
    });

    it('renders a QR while pairing and only for a writer', async () => {
        const writer = await mount({ permissions: ['connection:wa:write'] });
        const img = writer.testId('connection-qr');

        expect(img?.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
        expect(writer.root.innerHTML).not.toContain('secret-pairing-material');

        await writer.emit('widgets', { widgets: [] });
        expect(writer.testId('connection-qr')).toBeNull();

        mounted?.unmount();
        mounted = undefined;

        const reader = await mount({ permissions: ['connection:wa:read'] });

        expect(reader.testId('connection-qr')).toBeNull();
        expect(reader.testId('connection-readonly')).not.toBeNull();
        expect(reader.root.innerHTML).not.toContain('secret-pairing-material');
        expect(reader.calls.some((call) => call.url.endsWith('/events'))).toBe(false);
    });

    it('reset confirms in the page', async () => {
        const dialog = vi.fn(() => true);

        vi.stubGlobal('confirm', dialog);

        const { calls, testId } = await mount({ permissions: ['connection:wa:write'] });
        const posts = () => calls.filter((call) => call.method === 'POST');

        testId('connection-reset')?.click();
        await flush();

        expect(testId('connection-reset-confirm')).not.toBeNull();
        expect(posts()).toEqual([]);

        testId('connection-reset-yes')?.click();
        await flush();

        expect(posts()).toEqual([{ method: 'POST', url: '/connections/wa/reset' }]);
        expect(dialog).not.toHaveBeenCalled();
        expect(testId('connection-reset-confirm')).toBeNull();
    });

    it('says so when the app has no WhatsApp connection', async () => {
        const { testId } = await mount({ permissions: ['*'], connections: [] });

        expect(testId('connections-empty')).not.toBeNull();
    });
});
