/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';
import { staticRoutes } from '@chamvi/http';
import type { HttpRoute } from '@chamvi/http';
import { uiRoutes } from '@chamvi/ui';
import { FIXTURE_BUILD, createUiTestApp, get } from '../../utils/app.ts';

const MARK = 'the mail page';

let pageRoot: string;

beforeAll(async () => {
    pageRoot = await mkdtemp(join(tmpdir(), 'chamvi-page-'));
    await writeFile(join(pageRoot, 'index.html'), `<!doctype html><head><!--chamvi-config--></head><body>${MARK}</body>`);
});

afterAll(async () => {
    await rm(pageRoot, { recursive: true, force: true });
});

function page(uiBase: string): HttpRoute[] {
    return staticRoutes({
        path: `${uiBase}/ext/tool-mail`,
        root: pageRoot,
        config: (apiBase) => ({
            apiBase, 
            uiBase: `${apiBase}${uiBase}`, 
            auth: { tokens: true }, 
        }),
        csp: () => "default-src 'self'",
    });
}

function dashboard(basePath?: string): HttpRoute[] {
    return uiRoutes({ root: FIXTURE_BUILD, ...(basePath ? { basePath } : {}) });
}

describe('uiRoutes and a registered page', () => {
    it.each([
        ['the dashboard first', () => [...dashboard(), ...page('/ui')]],
        ['the page first', () => [...page('/ui'), ...dashboard()]],
    ])('uiRoutes passes /ui/ext/* through in either registration order: %s', async (_order, routes) => {
        const { app } = createUiTestApp({ routes: routes() });
        const deep = await get(app, '/ui/ext/tool-mail/accounts/work');

        expect(deep.status).toBe(200);
        expect(await deep.text()).toContain(MARK);
        expect(await (await get(app, '/ui/agents')).text()).not.toContain(MARK);
    });

    it.each([
        ['the dashboard first', () => [...dashboard('/console'), ...page('/console')]],
        ['the page first', () => [...page('/console'), ...dashboard('/console')]],
    ])('under a basePath and a custom dashboard path: %s', async (_order, routes) => {
        const { app } = createUiTestApp({ basePath: '/agents-app', routes: routes() });
        const deep = await get(app, '/agents-app/console/ext/tool-mail/accounts/work');

        expect(deep.status).toBe(200);
        expect(await deep.text()).toContain(MARK);
    });

    it.each(['/ui/ext/unknown', '/ui/ext/unknown/deep', '/ui/ext', '/ui/%65xt/unknown', '/UI/EXT/unknown'])(
        'answers 404 for %s, never the dashboard fallback',
        async (path) => {
            const { app } = createUiTestApp({ routes: [...dashboard(), ...page('/ui')] });
            const response = await get(app, path);

            expect(response.status).toBe(404);
            expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
        },
    );

    it('keeps a dashboard route that only starts with ext', async () => {
        const { app } = createUiTestApp({ routes: dashboard() });

        expect((await get(app, '/ui/external')).status).toBe(200);
    });
});
