/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    mkdir,
    mkdtemp,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { buildCsp, staticRoutes } from '@chamvi/http';
import type { StaticRoutesOptions } from '@chamvi/http';
import { call, createTestApp } from '../../utils/app.ts';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'chamvi-static-'));
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'index.html'), '<head><!--chamvi-config--></head>');
    await writeFile(join(root, 'assets', 'app-1a2b.js'), 'console.log(1)');
    await writeFile(join(root, 'favicon.txt'), 'hello');
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

function options(overrides: Partial<StaticRoutesOptions> = {}): StaticRoutesOptions {
    return {
        path: '/ui/ext/mail',
        root,
        config: (apiBase) => ({ apiBase, secret: '</script><b>' }),
        csp: (config) => buildCsp(config as { auth?: { authup?: { url: string } } }),
        ...overrides,
    };
}

describe('staticRoutes()', () => {
    it("serves a deep link's index", async () => {
        const { app } = createTestApp({ routes: staticRoutes(options()) });

        const response = await call(app, 'GET', '/ui/ext/mail/accounts/mail-work');
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect(response.headers.get('cache-control')).toBe('no-cache');
        expect(html).toContain('<base href="/ui/ext/mail/">');
        expect(html).toContain('id="chamvi-config"');
        expect(html).toContain('\\u003c/script\\u003e');
        expect(html).not.toContain('</script><b>');
    });

    it('serves under a basePath', async () => {
        const { app } = createTestApp({ basePath: '/api', routes: staticRoutes(options()) });

        const response = await call(app, 'GET', '/api/ui/ext/mail/accounts');
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(html).toContain('<base href="/api/ui/ext/mail/">');
        expect(html).toContain('"apiBase":"/api"');
    });

    it('serves a file with its media type and caching, under the strict headers', async () => {
        const { app } = createTestApp({ routes: staticRoutes(options()) });

        const asset = await call(app, 'GET', '/ui/ext/mail/assets/app-1a2b.js');
        const file = await call(app, 'GET', '/ui/ext/mail/favicon.txt');

        expect(asset.status).toBe(200);
        expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
        expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
        expect(asset.headers.get('content-security-policy')).toContain("script-src 'self'");
        expect(asset.headers.get('x-frame-options')).toBe('DENY');
        expect(asset.headers.get('referrer-policy')).toBe('no-referrer');
        expect(file.headers.get('cache-control')).toBe('no-cache');
    });

    it('answers 404 for a missing file and a traversal', async () => {
        const { app } = createTestApp({ routes: staticRoutes(options()) });

        expect((await call(app, 'GET', '/ui/ext/mail/missing.js')).status).toBe(404);
        expect((await call(app, 'GET', '/ui/ext/mail/%252e%252e/secret')).status).toBe(404);
    });

    it('answers 500 for a missing build and retries only after a while', async () => {
        const errors: unknown[] = [];
        const { app, clock } = createTestApp({
            routes: staticRoutes(options({ root: join(root, 'absent') })),
            onError: (error) => {
                errors.push(error);
            },
        });

        expect((await call(app, 'GET', '/ui/ext/mail')).status).toBe(500);
        expect(errors).toHaveLength(1);
        expect((await call(app, 'GET', '/ui/ext/mail')).status).toBe(500);
        expect(errors).toHaveLength(1);

        clock.advance(5000);

        expect((await call(app, 'GET', '/ui/ext/mail')).status).toBe(500);
        expect(errors).toHaveLength(2);
    });

    it('refuses a bad path or root', () => {
        expect(() => staticRoutes(options({ path: '/Ui/Ext' }))).toThrow(InvalidAgentDefinitionError);
        expect(() => staticRoutes(options({ path: 'ui' }))).toThrow(InvalidAgentDefinitionError);
        expect(() => staticRoutes(options({ root: '' }))).toThrow(InvalidAgentDefinitionError);
    });
});
