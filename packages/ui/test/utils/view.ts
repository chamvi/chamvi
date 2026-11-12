/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { provideAlertDialogManager, provideToastManager } from '@vuecs/overlays';
import { createApp } from 'vue';
import type { Component } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { APP_CONTEXT, DEV_CONFIG, installVuecs } from '@chamvi/ui-kit';
import type { AppContext, IApiClient } from '@chamvi/ui-kit';
import { RouteName } from '../../app/router/constants.ts';
import { sessionOf } from './permissions.ts';

const STUB = { render: () => null };

/** Lets pending promises and a few event loop turns run. */
export const settle = (ms = 10) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

/**
 * Mounts a dashboard view (happy-dom) at `path` with vuecs, a router of
 * stub routes (the view at `pattern`) and an `AppContext` whose session's
 * permission check answered `names`.
 */
export async function mountView(view: Component, input: {
    path: string;
    pattern: string;
    name: string;
    client: IApiClient;
    names: readonly string[];
}) {
    const routes = [
        { path: '/agents', name: RouteName.AGENTS },
        { path: '/agents/:name', name: RouteName.AGENT },
        { path: '/runs', name: RouteName.RUNS },
        { path: '/runs/:id', name: RouteName.RUN },
        { path: '/approvals', name: RouteName.APPROVALS },
    ]
        .filter((route) => route.name !== input.name)
        .map((route) => ({ ...route, component: STUB }));
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [...routes, {
            path: input.pattern,
            name: input.name,
            component: view,
        }],
    });

    await router.push(input.path);
    await router.isReady();

    const root = document.createElement('div');

    document.body.append(root);

    const host = createApp(view);

    host.use(router);
    installVuecs(host);
    // App.vue's providers hold these queues; the confirmation is answered by the test
    provideToastManager(undefined, host);

    const dialogs = provideAlertDialogManager(undefined, host);

    host.provide(APP_CONTEXT, {
        config: DEV_CONFIG,
        client: input.client,
        session: sessionOf(input.names),
        storage: sessionStorage,
    } as unknown as AppContext);
    host.mount(root);
    await settle();

    return {
        root,
        /** Answers the open confirmation dialog. */
        confirm: (value: boolean) => dialogs.settle(value),
        testId: (id: string) => root.querySelector<HTMLElement>(`[data-testid="${CSS.escape(id)}"]`),
        unmount: () => {
            host.unmount();
            root.remove();
        },
    };
}
