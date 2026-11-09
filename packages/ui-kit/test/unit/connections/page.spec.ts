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
} from 'vitest';
import {
    createApp,
    defineComponent,
    h,
    shallowRef,
} from 'vue';
import type { App } from 'vue';
import type { IApiClient, MeWire } from '../../../src/api/types.ts';
import ConnectionsPage from '../../../src/connections/ConnectionsPage.vue';
import type { ConnectionTypeWire, ConnectionWire } from '../../../src/connections/types.ts';
import { install } from '../../../src/module.ts';
import { fakeClient } from '../../utils/client.ts';
import { json } from '../../utils/fetch.ts';
import { flush } from '../../utils/timers.ts';

const MAIL: ConnectionTypeWire = {
    type: 'mail',
    label: 'Mail',
    multiple: true,
    creatable: true,
    testable: false,
    fields: [],
};

const CONNECTIONS: ConnectionWire[] = [
    {
        name: 'mail-work',
        type: 'mail',
        status: 'disconnected',
        account: 'work',
    },
    {
        name: 'whatsapp',
        type: 'whatsapp',
        status: 'connected',
    },
];

const SETTINGS = {
    type: 'mail',
    state: 'configured',
    settings: {},
    fields: [],
    restartRequired: false,
    editable: true,
    deletable: false,
};

let mounted: App | undefined;

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    document.body.innerHTML = '';
    globalThis.history.replaceState(null, '', '/');
});

async function mountPage(search: string, options: { permissions?: string[]; type?: ConnectionTypeWire } = {}) {
    globalThis.history.replaceState(null, '', `/${search}`);

    const principal: MeWire = {
        id: 'peter',
        kind: 'token',
        permissions: options.permissions ?? ['*'],
    };
    const opened: string[] = [];
    const client: IApiClient = fakeClient({
        send: async (url: string) => {
            if (url === '/connections') {
                return json({ data: CONNECTIONS });
            }

            if (url === '/ui-pages') {
                return json({ data: [] });
            }

            if (url === '/connection-types') {
                return json({ data: [options.type ?? MAIL] });
            }

            opened.push(url);

            return json(SETTINGS);
        },
    });
    const app = createApp(defineComponent(() => () => h(ConnectionsPage, { slug: 'tool-mail', type: 'mail' })));

    install(app, {
        context: {
            config: {
                apiBase: '',
                uiBase: '/ui',
                auth: { tokens: true },
            },
            client,
            session: { principal: shallowRef(principal) } as never,
            storage: window.sessionStorage,
        },
    });
    document.body.innerHTML = '<div id="app"></div>';
    app.mount('#app');
    mounted = app;
    await flush();
    await flush();
    await flush();

    return { opened, adding: () => document.body.querySelector('[data-field="account"]') !== null };
}

describe('ConnectionsPage', () => {
    it('opens the connection the query names', async () => {
        const page = await mountPage('?connection=mail-work');

        expect(page.opened).toEqual(['/connections/mail-work/config']);
    });

    it('ignores a connection of another type', async () => {
        const page = await mountPage('?connection=whatsapp');

        expect(page.opened).toEqual(['/connections/mail-work/config']);
    });

    it('honours ?add for a creator of a multi-instance type', async () => {
        const page = await mountPage('?add=1');

        expect(page.adding()).toBe(true);
        expect(page.opened).toEqual([]);
    });

    it('settles ?add once the types answered without its type', async () => {
        const page = await mountPage('?add=1', { type: { ...MAIL, type: 'other' } });

        expect(page.adding()).toBe(false);
        expect(document.body.textContent).toContain('is not available in this app');
    });

    it('ignores ?add without connections:create', async () => {
        const page = await mountPage('?add=1', { permissions: ['connection:*:read'] });

        expect(page.adding()).toBe(false);
        expect(page.opened).toEqual(['/connections/mail-work/config']);
    });

    it('ignores ?add for a single-instance type', async () => {
        const page = await mountPage('?add=1', { type: { ...MAIL, multiple: false } });

        expect(page.adding()).toBe(false);
    });
});
