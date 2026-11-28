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
    type: 'discord',
    label: 'Discord',
    multiple: false,
    creatable: false,
    testable: true,
    fields: [{
        key: 'guilds',
        label: 'guilds',
        kind: 'list',
    }],
};

const SETTINGS: ConnectionSettingsWire = {
    type: 'discord',
    state: 'configured',
    settings: { guilds: ['1', '2'] },
    fields: [{ key: 'guilds', source: { kind: 'store' } }],
    revision: 1,
    generation: 'gen-1',
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

describe('the Discord page text', () => {
    it('shows the configured connection', async () => {
        expect(renderedText(await mount(['discord']))).toMatchInlineSnapshot(`
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
          discord
          Discord: discord
          guilds
          Comma separated.
          Save
          Test
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
