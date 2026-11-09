/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    mkdtemp,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HttpRouteResult } from '@chamvi/http';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import {
    AppToken,
    configModule,
    uiPageModule,
} from '@chamvi/app';
import type { Env } from '@chamvi/app';
import { ControllableClock } from '@chamvi/test-kit';
import { buildHarness } from '../../utils/harness.ts';
import type { Harness } from '../../utils/harness.ts';
import { createRecordingLogger } from '../../utils/logger.ts';

let harnesses: Harness[] = [];
let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'chamvi-ui-page-'));
    await writeFile(join(root, 'index.html'), '<head><!--chamvi-config--></head>');
});

afterEach(async () => {
    await Promise.all(harnesses.map((harness) => harness.stop()));
    harnesses = [];
    await rm(root, { recursive: true, force: true });
});

async function contributions(env: Env, options: { uiBase?: string; slug?: string } = {}) {
    const clock = new ControllableClock(new Date('2026-11-09T00:00:00Z'));
    const harness = buildHarness({
        env,
        modules: [
            configModule({ clock, logger: createRecordingLogger(clock) }),
            uiPageModule({
                name: 'chamvi:tool-mail-ui',
                label: 'Mail',
                types: ['mail'],
                slug: options.slug ?? 'tool-mail',
                root,
                ...(options.uiBase ? { uiBase: options.uiBase } : {}),
            }),
        ],
    });

    harnesses.push(harness);
    await harness.setup();

    const { container } = harness;

    return {
        clock,
        routes: container.resolveAll(AppToken.HTTP_ROUTES),
        pages: container.resolveAll(AppToken.UI_PAGES),
    };
}

async function renderIndex(env: Env): Promise<{ result: HttpRouteResult; html: string }> {
    const { clock, routes } = await contributions(env);
    const result = await routes[0]!.handler(
        {
            request: new Request('http://test/ui/ext/tool-mail'),
            authorize: async () => {
                throw new Error('unauthenticated');
            },
            readBody: async () => new Uint8Array(),
            subpath: '',
        },
        {
            clock,
            basePath: '/api',
            onError: () => undefined,
        } as never,
    );

    return { result, html: new TextDecoder().decode(result.body as Uint8Array) };
}

describe('uiPageModule()', () => {
    it('contributes routes and a UiPage', async () => {
        const { routes, pages } = await contributions({});

        expect(routes).toHaveLength(1);
        expect(routes[0]).toMatchObject({
            method: 'GET',
            path: '/ui/ext/tool-mail',
            prefix: true,
            rateLimit: false,
        });
        expect(pages).toEqual([{
            slug: 'tool-mail',
            label: 'Mail',
            types: ['mail'],
            path: '/ui/ext/tool-mail',
        }]);
    });

    it('honours a custom dashboard base', async () => {
        const { routes, pages } = await contributions({}, { uiBase: '/console' });

        expect(routes[0]!.path).toBe('/console/ext/tool-mail');
        expect(pages[0]!.path).toBe('/console/ext/tool-mail');
    });

    it('refuses a slug that is no path segment', async () => {
        await expect(contributions({}, { slug: 'a/B' })).rejects.toThrow(/lower-case path/);
    });

    it('renders the page with the app base and the token login', async () => {
        const { result, html } = await renderIndex({});

        expect(result.status).toBe(200);
        expect(html).toContain('<base href="/api/ui/ext/tool-mail/">');
        expect(html).toContain('"apiBase":"/api"');
        expect(html).toContain('"uiBase":"/api/ui"');
        expect(html).toContain('"tokens":true');
        expect(result.headers?.['content-security-policy']).toContain("connect-src 'self';");
    });

    it('lets the authup origin through the CSP when the dashboard signs in with authup', async () => {
        const { result, html } = await renderIndex({
            CHAMVI_UI_AUTHUP_CLIENT_ID: 'client',
            AUTHUP_URL: 'https://auth.example/base',
        });

        expect(html).toContain('"clientId":"client"');
        expect(result.headers?.['content-security-policy']).toContain("connect-src 'self' https://auth.example;");
    });
});
