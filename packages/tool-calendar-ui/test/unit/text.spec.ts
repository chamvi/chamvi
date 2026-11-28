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
import type { AppContext } from '@chamvi/ui-kit';
import { Client } from '@chamvi/http-kit';
import type { ConnectionSettingsWire, ConnectionTypeWire } from '@chamvi/http-kit';
import Page from '../../app/App.vue';

const TYPE: ConnectionTypeWire = {
    type: 'calendar',
    label: 'Calendar',
    multiple: true,
    creatable: true,
    testable: true,
    fields: [{
        key: 'url',
        label: 'CalDAV URL',
        kind: 'string',
        required: true,
    }],
};

const SETTINGS: ConnectionSettingsWire = {
    type: 'calendar',
    state: 'configured',
    settings: { url: 'https://dav.example.com/' },
    fields: [{ key: 'url', source: { kind: 'store' } }],
    revision: 1,
    generation: 'gen-1',
    restartRequired: false,
    editable: true,
    deletable: true,
};

let mounted: App | undefined;

afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    document.body.innerHTML = '';
});

/**
 * The text of every text node under `root`, whitespace collapsed, one per
 * line, then `[attribute=value]` for each aria-label, title, placeholder and
 * alt: what the page says, pinned so a restyle or a catalog keeps it.
 */
function renderedText(root: HTMLElement): string {
    const attributes = ['aria-label', 'title', 'placeholder', 'alt'];
    const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();
    const lines: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = collapse(node.textContent ?? '');

        if (text && !node.parentElement?.closest('script, style, template')) {
            lines.push(text);
        }
    }

    for (const element of Array.from(root.querySelectorAll(attributes.map((name) => `[${name}]`).join(', ')))) {
        for (const name of attributes) {
            const value = collapse(element.getAttribute(name) ?? '');

            if (value) {
                lines.push(`[${name}=${value}]`);
            }
        }
    }

    return lines.join('\n');
}

async function mount(connections: string[]): Promise<HTMLElement> {
    const permissions = ['chamvi_connection_read', 'chamvi_connection_write', 'chamvi_connection_create'];
    const send = async (url: string) => {
        const body: Record<string, unknown> = {
            '/ui-pages': { data: [] },
            '/connection-types': { data: [TYPE] },
            '/connections': {
                data: connections.map((name) => ({
                    name,
                    type: TYPE.type,
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
        // a custom transport hands every request to the spec's router
        client: new Client({ baseURL: '', transport: { dispatch: (request) => send(request.url) } }),
        session: {
            principal: shallowRef({ id: 'a', kind: 'token' }),
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

describe('the Calendar page text', () => {
    it('shows the empty list', async () => {
        expect(renderedText(await mount([]))).toMatchInlineSnapshot(`
          "chamvi
          Operate
          Agents
          Runs
          Approvals
          Schedules
          localhost:3000
          A
          a
          token · 3 permissions
          Accounts
          No accounts yet.
          + Add account
          No accounts yet.
          [aria-label=Main]
          [title=localhost:3000]
          [aria-label=Dark mode]
          [title=Dark mode]
          [aria-label=Sign out]
          [title=Sign out]
          [aria-label=Accounts]"
        `);
    });

    it('shows an account', async () => {
        expect(renderedText(await mount(['calendar-work']))).toMatchInlineSnapshot(`
          "chamvi
          Operate
          Agents
          Runs
          Approvals
          Schedules
          Connections
          localhost:3000
          A
          a
          token · 3 permissions
          Accounts
          calendar-work
          + Add account
          Calendar account: work
          CalDAV URL
          *
          Save
          Test
          Delete
          [aria-label=Main]
          [title=localhost:3000]
          [aria-label=Dark mode]
          [title=Dark mode]
          [aria-label=Sign out]
          [title=Sign out]
          [aria-label=Accounts]
          [aria-label=disconnected]
          [title=disconnected]
          [title=Tests the saved values]"
        `);
    });
});
