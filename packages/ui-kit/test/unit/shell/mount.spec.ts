/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

// @vitest-environment happy-dom

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { IApiClient } from '../../../src/api/types.ts';
import { LOGIN_ROUTE_NAME, TOKEN_STORAGE_KEY } from '../../../src/auth/constants.ts';
import { CONFIG_ELEMENT_ID } from '../../../src/config/constants.ts';
import { useAppContext } from '../../../src/context/module.ts';
import { mountPage } from '../../../src/shell/mount.ts';
import { json } from '../../utils/fetch.ts';
import icons from '../../utils/icons.ts';

const addCollection = vi.hoisted(() => vi.fn());

vi.mock('@iconify/vue', async (original) => ({
    ...await original<Record<string, unknown>>(),
    addCollection,
}));

const ME = {
    id: 'admin',
    kind: 'token',
};

const Page = defineComponent(() => {
    const { config } = useAppContext();

    return () => h('p', { id: 'page' }, config.uiBase);
});

function setDocument(): void {
    document.body.innerHTML = '<div id="app"></div>';

    const config = document.createElement('script');

    config.id = CONFIG_ELEMENT_ID;
    config.type = 'application/json';
    config.textContent = JSON.stringify({
        apiBase: '/api',
        uiBase: '/console',
        auth: { tokens: true },
    });
    document.head.append(config);
}

describe('mountPage', () => {
    let replace: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        window.sessionStorage.clear();
        document.head.innerHTML = '';
        setDocument();
        addCollection.mockClear();
        replace = vi.fn();
        vi.spyOn(window.location, 'replace').mockImplementation(replace as never);
        vi.stubGlobal('fetch', vi.fn(async () => json(ME)));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('registers the bundled icons and mounts a signed-in page with the injected config', async () => {
        window.sessionStorage.setItem(TOKEN_STORAGE_KEY, 'good');

        await mountPage(Page);

        expect(addCollection).toHaveBeenCalledWith(icons);
        expect(document.querySelector('#page')?.textContent).toBe('/console');
        expect(replace).not.toHaveBeenCalled();
    });

    it('sends a page without a principal to the dashboard login, unmounted, with its way back', async () => {
        window.history.replaceState({}, '', '/console/ext/mail?a=1#b');

        await mountPage(Page);

        expect(replace).toHaveBeenCalledWith('/console/login?redirect=%2Fconsole%2Fext%2Fmail%3Fa%3D1%23b');
        expect(document.querySelector('#page')).toBeNull();
    });

    it('leaves the guarding to a router when given one', async () => {
        const fetch = vi.fn(async () => json(ME));

        vi.stubGlobal('fetch', fetch);

        const router = createRouter({
            history: createMemoryHistory(),
            routes: [{ path: '/', component: { render: () => null } }],
        });

        await mountPage(Page, { router: () => router });

        expect(document.querySelector('#page')?.textContent).toBe('/console');
        expect(fetch).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
    });

    describe('a 401 that stands', () => {
        let client: IApiClient | undefined;

        const Caller = defineComponent(() => {
            ({ client } = useAppContext());

            return () => h('p', { id: 'page' });
        });

        const createLoginRouter = () => createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/', component: { render: () => null } },
                { path: '/private', component: { render: () => null } },
                {
                    path: '/login',
                    name: LOGIN_ROUTE_NAME,
                    component: { render: () => null },
                    meta: { public: true },
                },
            ],
        });

        beforeEach(() => {
            client = undefined;
            window.sessionStorage.setItem(TOKEN_STORAGE_KEY, 'good');
        });

        it('signs a routerless page out and sends it to the dashboard login, keeping the way back', async () => {
            const fetch = vi.fn(async () => json(ME));

            window.history.replaceState({}, '', '/console/ext/mail?a=1#b');
            vi.stubGlobal('fetch', fetch);
            await mountPage(Caller);

            fetch.mockImplementation(async () => json({ message: 'expired' }, 401));
            await expect(client!.listAgents()).rejects.toThrow();

            await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/console/login?redirect=%2Fconsole%2Fext%2Fmail%3Fa%3D1%23b'));
            expect(window.sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
        });

        it('signs a routed page out and replaces the route with the login, keeping the way back', async () => {
            vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'expired' }, 401)));

            const router = createLoginRouter();

            await router.push('/private?tab=runs');
            await mountPage(Caller, { router: () => router });
            await expect(client!.listAgents()).rejects.toThrow();

            await vi.waitFor(() => expect(router.currentRoute.value.name).toBe(LOGIN_ROUTE_NAME));
            expect(router.currentRoute.value.query).toEqual({ redirect: '/private?tab=runs' });
            expect(window.sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
            expect(replace).not.toHaveBeenCalled();
        });

        it('leaves a public route and its session alone', async () => {
            vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'bad token' }, 401)));

            const router = createLoginRouter();

            await router.push('/login');
            await mountPage(Caller, { router: () => router });
            await expect(client!.listAgents()).rejects.toThrow();
            await new Promise((resolve) => {
                setTimeout(resolve, 0); 
            });

            expect(router.currentRoute.value.fullPath).toBe('/login');
            expect(window.sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBe('good');
            expect(replace).not.toHaveBeenCalled();
        });
    });
});
