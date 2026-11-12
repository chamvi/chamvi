/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// @vitest-environment happy-dom

import { Permission } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import { describe, expect, it } from 'vitest';
import { createApp, shallowRef } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { APP_CONTEXT } from '@chamvi/ui-kit';
import type { AppContext } from '@chamvi/ui-kit';
import ConnectionView from '../../../../app/views/ConnectionView.vue';
import { RouteName } from '../../../../app/router/constants.ts';
import { ALL, grant } from '../../../utils/permissions.ts';

const DETAIL = {
    name: 'wa',
    type: 'whatsapp',
    status: 'pairing',
    canReset: true,
    widgets: [{ kind: 'qr', value: '2@secret-pairing-material' }],
};

async function mountView(bindings: PermissionBinding[]) {
    const send = async (url: string) => {
        if (url.endsWith('/events')) {
            return new Promise<Response>(() => {});
        }

        return new Response(JSON.stringify(url === '/connections' ? { data: [DETAIL] } : DETAIL));
    };
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
                bindings, 
            }), 
        },
    } as unknown as AppContext);
    app.mount(root);

    await new Promise((resolve) => {
        setTimeout(resolve, 10);
    });

    return { root, unmount: () => app.unmount() };
}

describe('the connection view', () => {
    it('renders no QR for a pairing connection but points to its page, keeps status and reset', async () => {
        const { root, unmount } = await mountView(ALL);

        expect(root.querySelector('[data-testid="connection-status"]')).not.toBeNull();
        expect(root.querySelector('[data-testid="connection-reset"]')).not.toBeNull();
        expect(root.querySelector('[data-testid="connection-qr"]')).toBeNull();
        expect(root.querySelector('.connection-widget')).toBeNull();
        expect(root.querySelector('img')).toBeNull();
        expect(root.innerHTML).not.toContain('secret-pairing-material');
        expect(root.querySelector('[data-testid="connection-pairing"]')?.textContent).toContain('its page in the sidebar');
        unmount();
    });

    it('offers reset to a write grant restricted to the connection\'s type', async () => {
        const { root, unmount } = await mountView([grant(Permission.CONNECTION_WRITE, { type: 'whatsapp' })]);

        expect(root.querySelector('[data-testid="connection-reset"]')).not.toBeNull();
        unmount();
    });

    it('offers no reset to a reader whose write grant names another type', async () => {
        const { root, unmount } = await mountView([
            grant(Permission.CONNECTION_READ),
            grant(Permission.CONNECTION_WRITE, { type: 'mail' }),
        ]);

        expect(root.querySelector('[data-testid="connection-status"]')).not.toBeNull();
        expect(root.querySelector('[data-testid="connection-reset"]')).toBeNull();
        unmount();
    });
});
