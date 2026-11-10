// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../shims.d.ts" />
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { addCollection } from '@iconify/vue';
import installButton from '@vuecs/button';
import vuecs from '@vuecs/core';
import installCountdown from '@vuecs/countdown';
import installElements from '@vuecs/elements';
import installForms from '@vuecs/forms';
import installIcon from '@vuecs/icon';
import lucide from '@vuecs/icons-lucide';
import installOverlays from '@vuecs/overlays';
import installPagination from '@vuecs/pagination';
import installPlaceholder from '@vuecs/placeholder';
import installTable from '@vuecs/table';
import tailwind from '@vuecs/theme-tailwind';
import installTimeago from '@vuecs/timeago';
import { createApp } from 'vue';
import type { Component } from 'vue';
import { createApiClient } from '../api/module.ts';
import type { IApiClient } from '../api/types.ts';
import { LOGIN_ROUTE_NAME } from '../auth/constants.ts';
import { createSession } from '../auth/module.ts';
import type { IAuthupAdapter } from '../auth/types.ts';
import { readConfig } from '../config/module.ts';
import { install } from '../module.ts';
import type { MountPageOptions } from './types.ts';

/**
 * Boots one page: icons, authup when configured, vuecs, the session, the
 * API client, the app context, then mounts `component` on `#app`. The page's
 * entry imports `@chamvi/ui-kit/style.css`; its Vite config comes from
 * `definePageConfig`, which provides the bundled icons this loads.
 */
export async function mountPage(component: Component, options: MountPageOptions = {}): Promise<void> {
    // icons from the bundle, never fetched (CSP connect-src 'self')
    const { default: icons } = await import('virtual:chamvi-icons');

    addCollection(icons);

    const config = readConfig(document);
    const app = createApp(component);

    // the authup kit (and its pinia) must be installed before vuecs
    let adapter: IAuthupAdapter | undefined;

    if (config.auth.authup) {
        const { createAuthupAdapter } = await import('../auth/authup.ts');

        adapter = createAuthupAdapter(app, config.auth.authup, config.uiBase);
    }

    app.use(vuecs, { themes: [tailwind()], icons: [lucide()] });

    for (const plugin of [
        installIcon,
        installButton,
        installCountdown,
        installElements,
        installForms,
        installOverlays,
        installPagination,
        installPlaceholder,
        installTable,
        installTimeago,
    ]) {
        app.use(plugin);
    }

    let client: IApiClient;
    const session = createSession(config, {
        storage: window.sessionStorage,
        client: () => client,
        ...(adapter ? { authup: async () => adapter } : {}),
    });
    const router = options.router?.({ config, session });
    const toLogin = (): void => window.location.replace(`${config.uiBase}/login`);

    client = createApiClient({
        apiBase: config.apiBase,
        token: () => session.token(),
        refresh: () => session.refresh(),
        onUnauthorized: () => {
            if (!router) {
                void session.signOut().then(toLogin);

                return;
            }

            const current = router.currentRoute.value;

            if (current.meta.public === true) {
                return;
            }

            void session.signOut().then(() => router.replace({ name: LOGIN_ROUTE_NAME, query: { redirect: current.fullPath } }));
        },
    });

    install(app, {
        context: {
            config,
            client,
            session,
            storage: window.sessionStorage,
        },
    });

    if (router) {
        app.use(router);
    } else {
        await session.restore();

        if (!session.principal.value) {
            toLogin();

            return;
        }
    }

    app.mount('#app');
}
