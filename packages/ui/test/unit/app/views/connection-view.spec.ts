/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// @vitest-environment happy-dom

import { Permission } from '@chamvi/access';
import { describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { APP_CONTEXT, ApiError } from '@chamvi/ui-kit';
import type { AppContext } from '@chamvi/ui-kit';
import ConnectionView from '../../../../app/views/ConnectionView.vue';
import { RouteName } from '../../../../app/router/constants.ts';
import { ALL, sessionOf } from '../../../utils/permissions.ts';

const flush = () => new Promise((resolve) => {
    setTimeout(resolve, 10);
});

const DETAIL = {
    name: 'wa',
    type: 'whatsapp',
    status: 'pairing',
    canReset: true,
    widgets: [{ kind: 'qr', value: '2@secret-pairing-material' }],
};


async function mountView(names: readonly string[], options: { refuseReset?: boolean } = {}) {
    const send = async (url: string, init: { method?: string } = {}) => {
        if (url.endsWith('/events')) {
            return new Promise<Response>(() => {});
        }

        if (url.endsWith('/reset') && init.method === 'POST' && options.refuseReset) {
            // the client turns a non-2xx answer into an ApiError, as `@chamvi/http` answers a missing permission
            throw new ApiError(403, 'FORBIDDEN', `Missing permission "${Permission.CONNECTION_WRITE}".`);
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
        session: sessionOf(names),
    } as unknown as AppContext);
    app.mount(root);

    await flush();

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

    it('offers reset when the session is allowed chamvi_connection_write', async () => {
        const { root, unmount } = await mountView([Permission.CONNECTION_WRITE]);

        expect(root.querySelector('[data-testid="connection-reset"]')).not.toBeNull();
        unmount();
    });

    it('offers no reset to a reader without chamvi_connection_write', async () => {
        const { root, unmount } = await mountView([Permission.CONNECTION_READ]);

        expect(root.querySelector('[data-testid="connection-status"]')).not.toBeNull();
        expect(root.querySelector('[data-testid="connection-reset"]')).toBeNull();
        expect(root.querySelector('[data-testid="connection-readonly"]')?.textContent).toContain(Permission.CONNECTION_WRITE);
        unmount();
    });

    it('names chamvi_connection_write inline when the API refuses the reset (403)', async () => {
        const { root, unmount } = await mountView([Permission.CONNECTION_WRITE], { refuseReset: true });

        root.querySelector<HTMLElement>('[data-testid="connection-reset"]')?.click();
        await flush();
        root.querySelector<HTMLElement>('[data-testid="connection-reset-yes"]')?.click();
        await flush();

        expect(root.querySelector('[data-testid="connection-reset-error"]')?.textContent).toContain(Permission.CONNECTION_WRITE);
        unmount();
    });
});
