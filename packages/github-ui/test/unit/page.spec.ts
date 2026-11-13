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
import { createApp, shallowRef } from 'vue';
import type { App } from 'vue';
import { APP_CONTEXT, ApiError, installVuecs } from '@chamvi/ui-kit';
import type { AppContext, ConnectionSettingsWire, ConnectionTypeWire } from '@chamvi/ui-kit';
import Page from '../../app/App.vue';

const TYPE: ConnectionTypeWire = {
    type: 'github',
    label: 'GitHub',
    multiple: false,
    creatable: false,
    testable: true,
    fields: [{
        key: 'appId',
        label: 'App ID',
        kind: 'string',
        required: true,
    }],
};

const SETTINGS: ConnectionSettingsWire = {
    type: 'github',
    state: 'configured',
    settings: { appId: '1' },
    fields: [{ key: 'appId', source: { kind: 'store' } }],
    restartRequired: false,
    editable: true,
    deletable: false,
};

let mounted: App | undefined;

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    document.body.innerHTML = '';
});

async function mount(names: string[], options: { permissions?: string[]; refuseSave?: boolean } = {}): Promise<HTMLElement> {
    const permissions = options.permissions ?? [];
    const send = async (url: string, init: { method?: string } = {}) => {
        if (init.method === 'PUT' && options.refuseSave) {
            // the client turns a non-2xx answer into an ApiError, as `@chamvi/http` answers a missing permission
            throw new ApiError(403, 'FORBIDDEN', 'Missing permission "chamvi_connection_write".');
        }

        const body: Record<string, unknown> = {
            '/ui-pages': { data: [] },
            '/connection-types': { data: [TYPE] },
            '/connections': {
                data: names.map((name) => ({
                    name, 
                    type: 'github', 
                    status: 'disconnected', 
                })), 
            },
        };

        return new Response(JSON.stringify(body[url] ?? SETTINGS));
    };
    const root = document.createElement('div');

    document.body.append(root);

    const app = createApp(Page);

    installVuecs(app);

    app.provide(APP_CONTEXT, {
        config: {
            apiBase: '', 
            uiBase: '/ui', 
            auth: { tokens: true }, 
        },
        client: { send },
        session: {
            principal: shallowRef({ id: 'a', kind: 'token' }),
            // the names POST /authorization/check answered
            permissions: shallowRef(new Set(permissions)),
            allowed: (name: string) => permissions.includes(name),
        },
    } as unknown as AppContext);
    app.mount(root);
    mounted = app;

    await new Promise((resolve) => {
        setTimeout(resolve, 10);
    });

    return root;
}

describe('the GitHub page', () => {
    it('shows the instance name', async () => {
        const root = await mount(['acme']);

        expect(root.querySelector('h1')?.textContent).toContain('GitHub: acme');
        expect(root.querySelector('[data-account="acme"]')?.textContent).toContain('acme');
    });

    it('keeps a name that starts with the type whole', async () => {
        const root = await mount(['github-eu']);

        expect(root.querySelector('h1')?.textContent).toContain('GitHub: github-eu');
    });

    it('names chamvi_connection_write inline when the API refuses the save (403)', async () => {
        const root = await mount(['acme'], {
            permissions: ['chamvi_connection_read', 'chamvi_connection_write'],
            refuseSave: true,
        });

        root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });

        expect(root.querySelector('[data-testid="connection-form-failure"]')?.textContent).toContain('chamvi_connection_write');
    });
});
