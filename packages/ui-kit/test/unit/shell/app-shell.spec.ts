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
    vi,
} from 'vitest';
import {
    createApp,
    defineComponent,
    h,
    nextTick,
    shallowRef,
} from 'vue';
import type { App } from 'vue';
import { Permission } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import type { IApiClient, MeWire } from '../../../src/api/types.ts';
import type { UiConfig } from '../../../src/config/types.ts';
import type { ConnectionWire } from '../../../src/connections/types.ts';
import { install } from '../../../src/module.ts';
import AppShell from '../../../src/shell/AppShell.vue';
import { fakeClient } from '../../utils/client.ts';
import { json } from '../../utils/fetch.ts';
import { ALL, authorized, grant } from '../../utils/permissions.ts';
import { flush } from '../../utils/timers.ts';

const MAIL_PAGE = {
    slug: 'tool-mail',
    label: 'Mail',
    types: ['mail'],
    path: '/ui/ext/tool-mail',
};

const CALENDAR_PAGE = {
    slug: 'tool-calendar',
    label: 'Calendar',
    types: ['calendar'],
    path: '/ui/ext/tool-calendar',
};

const CONFIG: UiConfig = {
    apiBase: '',
    uiBase: '/ui',
    auth: { tokens: true },
};

type World = {
    bindings: PermissionBinding[];
    principal?: Partial<MeWire>;
    connections?: ConnectionWire[];
    pages?: unknown[];
    current?: string;
    navigate?: (path: string) => void;
    accounts?: () => unknown;
    onSignOut?: () => void;
    signOut?: () => Promise<void>;
};

let mounted: App | undefined;

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

function clientOf(world: World): IApiClient {
    return fakeClient({
        send: async (url: string) => {
            if (url === '/connections') {
                return json({ data: world.connections ?? [] });
            }

            if (url === '/ui-pages') {
                return json({ data: world.pages ?? [MAIL_PAGE] });
            }

            if (url === '/connection-types') {
                return json({ data: [] });
            }

            throw new Error(`unexpected ${url}`);
        },
    });
}

async function mountShell(world: World): Promise<HTMLElement> {
    const principal: MeWire = {
        id: 'peter',
        kind: 'token',
        bindings: world.bindings,
        ...world.principal,
    };
    const session = { principal: shallowRef(principal), signOut: world.signOut ?? (async () => undefined) };
    const app = createApp(defineComponent(() => () => h(AppShell, {
        principal,
        current: world.current,
        navigate: world.navigate,
        ...(world.onSignOut ? { onSignOut: world.onSignOut } : {}),
    }, {
        default: () => h('p', { id: 'content' }, 'content'),
        ...(world.accounts ? { accounts: world.accounts } : {}),
    })));

    install(app, {
        context: {
            config: CONFIG,
            client: clientOf(world),
            session: session as never,
            storage: window.sessionStorage,
        },
    });
    document.body.innerHTML = '<div id="app"></div>';
    app.mount('#app');
    mounted = app;
    await flush();
    await flush();
    await nextTick();

    return document.body;
}

const pageLink = (root: HTMLElement) => root.querySelector<HTMLAnchorElement>('a[data-page="tool-mail"]');

describe('AppShell', () => {
    it('shows a page item for a reader of its type', async () => {
        const root = await mountShell({
            bindings: [grant(Permission.CONNECTION_READ, { name: 'mail-work' })],
            connections: [{
                name: 'mail-work', 
                type: 'mail', 
                status: 'disconnected', 
            }],
        });

        expect(pageLink(root)?.textContent).toContain('Mail');
    });

    it('shows it for a holder of chamvi_connection_create with zero connections', async () => {
        const root = await mountShell({ bindings: [grant(Permission.CONNECTION_CREATE)] });

        expect(pageLink(root)).not.toBeNull();
    });

    it('shows a creator restricted by type only the page of that type', async () => {
        const root = await mountShell({
            bindings: [grant(Permission.CONNECTION_CREATE, { type: 'calendar' })],
            pages: [MAIL_PAGE, CALENDAR_PAGE],
        });

        expect(pageLink(root)).toBeNull();
        expect(root.querySelector('a[data-page="tool-calendar"]')).not.toBeNull();
    });

    it('hides it otherwise', async () => {
        const root = await mountShell({
            bindings: [grant(Permission.CONNECTION_READ, { name: 'other' })],
            connections: [{
                name: 'other', 
                type: 'whatsapp', 
                status: 'connected', 
            }],
        });

        expect(pageLink(root)).toBeNull();
    });

    it('does not take a connection read grant for chamvi_connection_create', async () => {
        expect(pageLink(await mountShell({ bindings: [grant(Permission.CONNECTION_READ)] }))).toBeNull();
    });

    it('gates a page item with the grants of an authorization snapshot', async () => {
        const connections: ConnectionWire[] = [{
            name: 'mail-work',
            type: 'mail',
            status: 'disconnected',
        }];

        const reader = await mountShell({
            bindings: [],
            principal: { kind: 'authup', ...authorized(grant(Permission.CONNECTION_READ, { name: 'mail-work' })) },
            connections,
        });

        expect(pageLink(reader)).not.toBeNull();
        expect(reader.querySelector('.who-sub')?.textContent?.trim()).toBe('authup · 1 grant');
    });

    it('shows a snapshot creator restricted by type only the page of that type', async () => {
        const root = await mountShell({
            bindings: [],
            principal: { kind: 'authup', ...authorized(grant(Permission.CONNECTION_CREATE, { type: 'calendar' })) },
            pages: [MAIL_PAGE, CALENDAR_PAGE],
        });

        expect(pageLink(root)).toBeNull();
        expect(root.querySelector('a[data-page="tool-calendar"]')).not.toBeNull();
    });

    it('counts the distinct permission names the principal holds', async () => {
        const root = await mountShell({
            bindings: [
                grant(Permission.CONNECTION_READ, { name: 'a' }),
                grant(Permission.CONNECTION_READ, { name: 'b' }),
                grant(Permission.RUN_READ),
            ],
        });

        expect(root.querySelector('.who-sub')?.textContent?.trim()).toBe('token · 2 grants');
    });

    it('links a page by its full path and leaves it to the browser', async () => {
        const navigate = vi.fn();
        const root = await mountShell({ bindings: ALL, navigate });
        const link = pageLink(root)!;
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });

        expect(link.getAttribute('href')).toBe('/ui/ext/tool-mail');
        link.dispatchEvent(event);
        expect(navigate).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('draws the fixed items as links under the ui base', async () => {
        const root = await mountShell({
            bindings: ALL,
            connections: [{
                name: 'mail-work', 
                type: 'mail', 
                status: 'connected', 
            }],
        });
        const labels = [...root.querySelectorAll('a.nav-item')].map((link) => link.textContent?.trim());

        expect(labels).toEqual(['Agents', 'Runs', 'Approvals', 'Schedules', 'Connections', 'Mail']);
        expect(root.querySelector('a[data-nav="agents"]')?.getAttribute('href')).toBe('/ui/agents');
    });

    it('routes a fixed item through navigate when the host has a router', async () => {
        const navigate = vi.fn();
        const root = await mountShell({ bindings: ALL, navigate });
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });

        root.querySelector('a[data-nav="runs"]')!.dispatchEvent(event);

        expect(navigate).toHaveBeenCalledWith('/runs');
        expect(event.defaultPrevented).toBe(true);
    });

    it('leaves a modified click on a fixed item to the browser', async () => {
        const navigate = vi.fn();
        const root = await mountShell({ bindings: ALL, navigate });
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
        });

        root.querySelector('a[data-nav="runs"]')!.dispatchEvent(event);

        expect(navigate).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('signs out and goes to the login when no host listens', async () => {
        const replace = vi.fn();
        const signOut = vi.fn(async () => undefined);

        vi.spyOn(window.location, 'replace').mockImplementation(replace as never);

        const root = await mountShell({ bindings: ALL, signOut });

        root.querySelector<HTMLButtonElement>('button[aria-label="Sign out"]')!.click();
        await flush();

        expect(signOut).toHaveBeenCalledOnce();
        expect(replace).toHaveBeenCalledWith('/ui/login');
    });

    it('leaves the sign-out to a host that listens', async () => {
        const replace = vi.fn();
        const signOut = vi.fn(async () => undefined);
        const onSignOut = vi.fn();

        vi.spyOn(window.location, 'replace').mockImplementation(replace as never);

        const root = await mountShell({
            bindings: ALL,
            signOut,
            onSignOut,
        });

        root.querySelector<HTMLButtonElement>('button[aria-label="Sign out"]')!.click();
        await flush();

        expect(onSignOut).toHaveBeenCalledOnce();
        expect(signOut).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
    });

    it('marks the current item and renders no accounts column without the slot', async () => {
        const root = await mountShell({ bindings: ALL, current: 'tool-mail' });

        expect(pageLink(root)?.getAttribute('aria-current')).toBe('page');
        expect(root.querySelector('a[data-nav="agents"]')?.getAttribute('aria-current')).toBeNull();
        expect(root.querySelector('.side-sub')).toBeNull();
    });

    it('renders the accounts slot as a second column', async () => {
        const root = await mountShell({
            bindings: ALL,
            accounts: () => h('p', { id: 'accounts' }, 'work'),
        });

        expect(root.querySelector('.side-sub #accounts')?.textContent).toBe('work');
        expect(root.querySelector('.shell')?.classList.contains('has-accounts')).toBe(true);
    });
});
