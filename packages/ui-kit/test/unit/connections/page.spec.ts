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
    nextTick,
    shallowRef,
} from 'vue';
import type { App } from 'vue';
import type { MeWire } from '../../../src/api/types.ts';
import type { UiConfig } from '../../../src/config/types.ts';
import ConnectionsPage from '../../../src/connections/ConnectionsPage.vue';
import type { ConnectionTypeWire } from '../../../src/connections/types.ts';
import { install } from '../../../src/module.ts';
import { fakeClient } from '../../utils/client.ts';
import { installFormKit } from '../../utils/forms.ts';
import { json } from '../../utils/fetch.ts';
import { flush } from '../../utils/timers.ts';

const CONFIG: UiConfig = {
    apiBase: '',
    uiBase: '/ui',
    auth: { tokens: true },
};

const TYPE: ConnectionTypeWire = {
    type: 'mail',
    label: 'Mail',
    multiple: true,
    creatable: true,
    testable: false,
    fields: [{
        key: 'host',
        label: 'IMAP host',
        kind: 'string',
    }],
};

const CREATED = {
    name: 'mail-work',
    type: 'mail',
    state: 'configured',
    settings: { host: 'imap.example.com' },
    fields: [{ key: 'host', source: { kind: 'store' } }],
    restartRequired: true,
    editable: true,
    deletable: true,
};

let mounted: App | undefined;

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    document.body.innerHTML = '';
    globalThis.history.replaceState({}, '', '/');
});

async function mountPage(permissions: string[]) {
    const requests: string[] = [];
    const principal: MeWire = {
        id: 'peter',
        kind: 'token',
        permissions,
    };
    const client = fakeClient({
        send: async (url: string, init: { method?: string } = {}) => {
            const method = init.method ?? 'GET';

            requests.push(`${method} ${url}`);

            if (method === 'POST' && url === '/connection-types/mail/connections') {
                return json(CREATED);
            }

            if (url === '/connections') {
                return json({ data: [] });
            }

            if (url === '/ui-pages') {
                return json({ data: [] });
            }

            if (url === '/connection-types') {
                return json({ data: [TYPE] });
            }

            if (url === '/connections/mail-work/config') {
                return json(CREATED);
            }

            throw new Error(`unexpected ${method} ${url}`);
        },
    });
    const app = createApp(defineComponent(() => () => h(ConnectionsPage, { slug: 'tool-mail', type: 'mail' })));

    installFormKit(app);
    install(app, {
        context: {
            config: CONFIG,
            client,
            session: { principal: shallowRef(principal), signOut: async () => undefined } as never,
            storage: window.sessionStorage,
        },
    });
    globalThis.history.replaceState({}, '', '/ui/ext/tool-mail/?add=1');
    document.body.innerHTML = '<div id="app"></div>';
    app.mount('#app');
    mounted = app;
    await flush();
    await flush();
    await nextTick();

    return {
        requests,
        root: document.body,
        add: async () => {
            for (const [key, value] of [['account', 'work'], ['host', 'imap.example.com']] as const) {
                const input = document.querySelector<HTMLInputElement>(`[data-field="${CSS.escape(key)}"] input`)!;

                input.value = value;
                input.dispatchEvent(new Event('input'));
            }

            document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
            await flush();
            await flush();
            await nextTick();
        },
    };
}

describe('ConnectionsPage', () => {
    it('confirms an account a creator cannot read instead of opening its form', async () => {
        const page = await mountPage(['connections:create']);

        await page.add();

        expect(page.requests).toContain('POST /connection-types/mail/connections');
        expect(page.requests).not.toContain('GET /connections/mail-work/config');
        expect(page.root.querySelector('[data-testid="connection-created"]')?.textContent).toContain('Added mail-work.');
        expect(page.root.querySelector('[data-testid="connection-created"]')?.textContent).toContain('Restart the app to apply.');
        expect(page.root.querySelector('[data-testid="connections-empty"]')).toBeNull();
    });

    it('opens the form of an account its creator may read', async () => {
        const page = await mountPage(['connections:create', 'connection:*:write']);

        await page.add();

        expect(page.requests).toContain('GET /connections/mail-work/config');
        expect(page.root.querySelector('[data-testid="connection-created"]')).toBeNull();
        expect(globalThis.location.search).toBe('?connection=mail-work');
    });
});
