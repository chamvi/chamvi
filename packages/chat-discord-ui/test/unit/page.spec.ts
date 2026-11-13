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
import { APP_CONTEXT, installVuecs } from '@chamvi/ui-kit';
import type { AppContext, ConnectionSettingsWire, ConnectionTypeWire } from '@chamvi/ui-kit';
import Page from '../../app/App.vue';

const POLICY = ['guilds', 'channels', 'users', 'roles', 'dmUsers'];

const TYPE: ConnectionTypeWire = {
    type: 'discord',
    label: 'Discord',
    multiple: false,
    creatable: false,
    testable: true,
    fields: POLICY.map((key) => ({
        key,
        label: key,
        kind: 'list',
    })),
};

const SETTINGS: ConnectionSettingsWire = {
    type: 'discord',
    state: 'configured',
    settings: { guilds: ['1', '2'] },
    fields: POLICY.map((key) => ({ key, source: key === 'guilds' ? { kind: 'store' } : { kind: 'unset' } })),
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

async function mount(): Promise<HTMLElement> {
    const send = async (url: string) => {
        const body: Record<string, unknown> = {
            '/ui-pages': { data: [] },
            '/connection-types': { data: [TYPE] },
            '/connections': {
                data: [{
                    name: 'discord', 
                    type: 'discord', 
                    status: 'disconnected', 
                }], 
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
            // POST /authorization/check answered no names
            permissions: shallowRef(new Set<string>()),
            allowed: () => false,
        },
    } as unknown as AppContext);
    app.mount(root);
    mounted = app;

    await new Promise((resolve) => {
        setTimeout(resolve, 10);
    });

    return root;
}

describe('the Discord page', () => {
    it('renders list fields for the policy', async () => {
        const root = await mount();

        for (const key of POLICY) {
            const field = root.querySelector(`[data-field="${CSS.escape(key)}"]`);

            expect(field?.querySelector('input')).not.toBeNull();
            expect(field?.textContent).toContain('Comma separated.');
        }

        expect(root.querySelector<HTMLInputElement>('[data-field="guilds"] input')?.value).toMatch(/^1,\s*2$/);
    });
});
