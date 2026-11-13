/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { z } from 'zod';
import {
    Engine,
    approve,
    createMemoryStore,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import type {
    ConnectionStatus,
    ConnectionWidget,
    IChannel,
    IConnectionHandle,
} from '@chamvi/core';
import { cron, cronChannel } from '@chamvi/channel-cron';
import {
    buildCsp,
    createHttpApp,
    http,
    httpChannel,
    mcpChannel,
    staticRoutes,
    staticTokens,
} from '@chamvi/http';
import type { StaticCspConfig } from '@chamvi/http';
import { uiRoutes } from '@chamvi/ui';
import { fileURLToPath } from 'node:url';
import { serve } from 'routup';
import {
    E2E_CONNECTION,
    E2E_PAGE_LABEL,
    E2E_PAGE_SLUG,
    E2E_PORT,
    E2E_QR,
    E2E_TOKEN,
} from './constants.ts';
import { createDemoModel } from './model.ts';

/** A 1x1 PNG, the release preview the `release` agent shows on its option. */
const PREVIEW_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** Takes the approval messages (and drops them): the tests answer in the dashboard. */
const capture: IChannel = {
    name: 'capture',
    out: () => Promise.resolve(),
};

/**
 * A connection handle like the WhatsApp module's: it starts pairing with a
 * QR, `POST /demo/connect` links it (the QR goes), reset pairs again.
 */
function createDemoConnection() {
    const listeners = new Set<() => void>();
    let status: ConnectionStatus = 'pairing';
    let widgets: ConnectionWidget[] = [{ kind: 'qr', value: E2E_QR }];
    const change = (next: ConnectionStatus, nextWidgets: ConnectionWidget[]) => {
        status = next;
        widgets = nextWidgets;

        for (const listener of listeners) {
            listener();
        }
    };
    const handle: IConnectionHandle = {
        name: E2E_CONNECTION,
        type: 'whatsapp',
        status: () => status,
        widgets: () => [...widgets],
        subscribe(listener) {
            listeners.add(listener);

            return () => listeners.delete(listener);
        },
        actions: {
            async reset() {
                change('pairing', [{ kind: 'qr', value: `${E2E_QR}-reset` }]);
            },
        },
    };

    return { handle, connect: () => change('connected', []) };
}

const connection = createDemoConnection();

const store = createMemoryStore();

const engine = new Engine({
    store,
    agents: [
        defineModelAgent({
            name: 'deploy',
            model: createDemoModel(),
            instructions: 'Deploy the requested environment.',
            channels: [http.on()],
            tools: {
                deploy: defineTool({
                    description: 'Deploy an environment.',
                    inputSchema: z.object({ env: z.string() }),
                    execute: async ({ env }, { context }) => {
                        const decision = await context.channels.findOneOrFail('capture').approve({
                            title: `Deploy ${env}?`,
                            body: `Rolls the demo release out to ${env}.`,
                            address: 'ops',
                        });

                        return decision.approved ? { deployed: env } : { denied: decision.reason ?? 'denied' };
                    },
                }),
            },
        }),
        defineModelAgent({
            name: 'release',
            model: createDemoModel(120, 'pick_version', {}),
            instructions: 'Release the version the owner picks.',
            channels: [http.on()],
            tools: {
                pick_version: defineTool({
                    description: 'Ask which version to release.',
                    inputSchema: z.object({}),
                    execute: async (_input, { context }) => {
                        // a keyed write: the replay after the answer replaces it instead of adding one
                        const preview = await context.artifacts.put({
                            key: 'preview/1.4.0',
                            mediaType: 'image/png',
                            filename: 'release-1.4.0.png',
                            data: new Uint8Array(Buffer.from(PREVIEW_PNG, 'base64')),
                        });
                        const decision = await approve(context, {
                            title: 'Release which version?',
                            options: [
                                {
                                    id: '1.4.0',
                                    label: 'Minor 1.4.0',
                                    artifacts: [preview.id],
                                    detail: '@@ -1 +1 @@\n-"version": "1.3.2"\n+"version": "1.4.0"',
                                },
                                { id: '2.0.0', label: 'Major 2.0.0' },
                            ],
                        });

                        return { released: decision.selected?.[0] ?? null };
                    },
                }),
            },
        }),
        defineModelAgent({
            name: 'digest',
            model: createDemoModel(),
            instructions: 'Write the morning digest.',
            channels: [cron.on('0 8 * * 1-5', { timezone: 'Europe/Berlin' })],
            state: { sent: z.object({ issues: z.number(), channel: z.string() }) },
        }),
    ],
    channels: [httpChannel(), mcpChannel(), cronChannel(), capture],
    claimTtlMs: 3000,
});

await store.state.set('digest', 'last_digest_at', '2026-10-21T06:00:12.481Z');
await store.state.set('digest', 'recipients', ['#maintainers']);
await store.state.upsertDocument('digest', 'sent', '2026-10-21', { issues: 14, channel: '#maintainers' });

const app = createHttpApp({
    engine,
    auth: [staticTokens({
        tokens: [{
            value: E2E_TOKEN,
            id: 'e2e',
            permissions: '*',
        }],
    })],
    metrics: false,
    // http's built document is not what the dashboard specs drive
    openapi: false,
    // one client address for the whole suite: its specs must not share a budget
    rateLimit: false,
    connections: () => [connection.handle],
    uiPages: () => [{
        slug: E2E_PAGE_SLUG,
        label: E2E_PAGE_LABEL,
        types: ['whatsapp'],
        path: `/ui/ext/${E2E_PAGE_SLUG}`,
    }],
    routes: [
        ...uiRoutes(),
        // built by the Playwright web server command from test/e2e/demo/page
        ...staticRoutes({
            path: `/ui/ext/${E2E_PAGE_SLUG}`,
            root: fileURLToPath(new URL('dist/app', import.meta.url)),
            config: (apiBase) => ({
                apiBase, 
                uiBase: `${apiBase}/ui`, 
                auth: { tokens: true }, 
            }),
            csp: (config) => buildCsp(config as StaticCspConfig),
        }),
        {
            method: 'POST',
            path: '/demo/connect',
            handler: async (request) => {
                await request.authorize();
                connection.connect();

                return { status: 204 };
            },
        },
    ],
});

await engine.start();
serve(app, {
    port: E2E_PORT,
    hostname: '127.0.0.1',
    gracefulShutdown: false,
});
