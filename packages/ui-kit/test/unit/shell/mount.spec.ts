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
import { TOKEN_STORAGE_KEY } from '../../../src/auth/constants.ts';
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
    permissions: ['*'],
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

    it('sends a page without a principal to the dashboard login, unmounted', async () => {
        await mountPage(Page);

        expect(replace).toHaveBeenCalledWith('/console/login');
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
});
