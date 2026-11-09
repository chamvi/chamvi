/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { createApp, shallowRef } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { APP_CONTEXT } from '@chamvi/ui-kit';
import type { AppContext } from '@chamvi/ui-kit';
import ConnectionView from '../../../../app/views/ConnectionView.vue';
import { RouteName } from '../../../../app/router/constants.ts';

const DETAIL = {
    name: 'wa',
    type: 'whatsapp',
    status: 'pairing',
    canReset: true,
    widgets: [{ kind: 'qr', value: '2@secret-pairing-material' }],
};

describe('the connection view', () => {
    it('renders no widget for a qr connection, keeps status and reset', async () => {
        const send = async (url: string) => (url.endsWith('/events') ?
            new Promise<Response>(() => {}) :
            new Response(JSON.stringify(DETAIL)));
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                {
                    path: '/connections', 
                    name: RouteName.CONNECTIONS, 
                    component: { render: () => null }, 
                },
                {
                    path: '/connections/:name', 
                    name: RouteName.CONNECTION, 
                    component: ConnectionView, 
                },
            ],
        });

        await router.push('/connections/wa');

        const root = document.createElement('div');
        const app = createApp(ConnectionView);

        app.use(router);
        app.provide(APP_CONTEXT, {
            client: { send },
            session: {
                principal: shallowRef({
                    id: 'a', 
                    kind: 'token', 
                    permissions: ['*'], 
                }), 
            },
        } as unknown as AppContext);
        app.mount(root);

        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });

        expect(root.querySelector('[data-testid="connection-status"]')).not.toBeNull();
        expect(root.querySelector('[data-testid="connection-reset"]')).not.toBeNull();
        expect(root.querySelector('[data-testid="connection-qr"]')).toBeNull();
        expect(root.querySelector('.connection-widget')).toBeNull();
        expect(root.querySelector('img')).toBeNull();
        expect(root.innerHTML).not.toContain('secret-pairing-material');
        app.unmount();
    });
});
