/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import {
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorCode, InvalidAgentDefinitionError } from '@chamvi/core';
import type { ChamviError } from '@chamvi/core';
import {
    afterAll,
    describe,
    expect,
    it,
} from 'vitest';
import type { App, IAppEvent } from 'routup';
import { OPENAPI_DOCUMENT_PATH } from '../../../src/openapi/constants.ts';
import { loadOpenApiDocument } from '../../../src/openapi/helpers.ts';
import { routeLabel } from '../../../src/plugins/helpers.ts';
import { createHttpApp } from '@chamvi/http';
import { createTestApp, testAuth } from '../../utils/app.ts';
import type { TestAppOverrides } from '../../utils/app.ts';

const DIRECTORY = mkdtempSync(join(tmpdir(), 'chamvi-openapi-'));

const DOCUMENT = {
    openapi: '3.2.0',
    info: { title: 'fixture', version: '1.0.0' },
    servers: [{ url: 'https://elsewhere.test' }],
    paths: { '/healthz': { get: { responses: { 200: { description: 'ok' } } } } },
};

function fixture(name: string, content: string): string {
    const path = join(DIRECTORY, name);

    writeFileSync(path, content);

    return path;
}

const DOCUMENT_PATH = fixture('swagger.json', JSON.stringify(DOCUMENT));

afterAll(() => {
    rmSync(DIRECTORY, { recursive: true, force: true });
});

/** A request with a socket address (the rate limiter keys by it). */
function get(app: App, path: string, headers: Record<string, string> = {}): Promise<Response> {
    const request = new Request(`http://test${path}`, { headers });

    (request as Request & { ip?: string }).ip = '10.0.0.1';

    return app.fetch(request);
}

function setup(overrides: TestAppOverrides = {}) {
    const errors: unknown[] = [];
    const { app } = createTestApp({
        openapi: { documentPath: DOCUMENT_PATH },
        onError: (error) => {
            errors.push(error);
        },
        ...overrides,
    });

    return { app, errors };
}

/** The `var options = {...};` the UI shell inlines, parsed. */
function inlinedOptions(html: string): Record<string, unknown> {
    const match = /var options = (\{[\s\S]*?\});\n/.exec(html);

    expect(match).not.toBeNull();

    return JSON.parse(match![1]!) as Record<string, unknown>;
}

function sha256(content: string): string {
    return `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`;
}

describe('GET /openapi.json', () => {
    it('serves the document without a token, its server the app root', async () => {
        const { app, errors } = setup();
        const response = await get(app, '/openapi.json');

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
        expect(await response.json()).toEqual({ ...DOCUMENT, servers: [{ url: '/' }] });
        expect(errors).toEqual([]);
    });

    it('serves it under basePath, its server the base path', async () => {
        const { app } = setup({ basePath: '/api' });
        const response = await get(app, '/api/openapi.json');

        expect(response.status).toBe(200);
        expect((await response.json() as typeof DOCUMENT).servers).toEqual([{ url: '/api' }]);
        expect((await get(app, '/openapi.json')).status).toBe(404);
    });

    it('answers a conditional request with 304', async () => {
        const { app } = setup();
        const first = await get(app, '/openapi.json');
        const etag = first.headers.get('etag');

        expect(etag).toBeTruthy();
        expect((await get(app, '/openapi.json', { 'if-none-match': etag! })).status).toBe(304);
    });

    it('stays JSON, /docs/openapi.json is the JSON 404', async () => {
        const { app } = setup();
        const below = await get(app, '/docs/openapi.json');

        expect(below.status).toBe(404);
        expect(await below.json()).toMatchObject({ status: 404 });

        const response = await get(app, '/openapi.json');

        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
        expect(await response.json()).toEqual({ ...DOCUMENT, servers: [{ url: '/' }] });
    });
});

describe('GET /docs', () => {
    it.each(['/docs', '/docs/'])('serves the UI shell at %s, inlining the served document', async (path) => {
        const { app } = setup();
        const response = await get(app, path);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');

        const options = inlinedOptions(await response.text());
        const served = await (await get(app, '/openapi.json')).json();

        expect(options.spec).toEqual(served);
    });

    it('under basePath, roots the page and its document at the base path', async () => {
        const { app } = setup({ basePath: '/api' });
        const html = await (await get(app, '/api/docs')).text();

        const options = inlinedOptions(html);

        expect(html).toContain('<base href="/api/docs/" />');
        expect(options.url).toBe('/api/openapi.json');
        // the standalone layout's topbar logo carries an inline <style> the CSP refuses
        expect(options.layout).toBe('BaseLayout');
        expect(options.validatorUrl).toBeNull();
        expect(options.spec).toEqual(await (await get(app, '/api/openapi.json')).json());
        expect((await get(app, '/docs')).status).toBe(404);
    });

    it.each([
        ['/DOCS', ''],
        ['/DoCs/', ''],
        ['/API/docs', '/api'],
    ])('answers the shell only at its canonical path: %s is the JSON 404 and does not leak into <base href>', async (path, basePath) => {
        const { app } = setup({ basePath });
        const other = await get(app, path);

        expect(other.status).toBe(404);
        expect(await other.json()).toMatchObject({ status: 404 });
        expect(await (await get(app, `${basePath}/docs`)).text()).toContain(`<base href="${basePath}/docs/" />`);
    });

    it.each(['', '/api'])('keeps the full policy on a conditional answer of the shell (basePath "%s")', async (basePath) => {
        const { app } = setup({ basePath });
        const first = await get(app, `${basePath}/docs`);
        const csp = first.headers.get('content-security-policy');
        const etag = first.headers.get('etag');

        await first.text();
        expect(csp).toContain('sha256-');
        expect(etag).toBeTruthy();

        const second = await get(app, `${basePath}/docs`, { 'if-none-match': etag! });

        expect(second.status).toBe(304);
        // a browser merges these headers into its stored shell: never a policy without the hashes
        expect(second.headers.get('content-security-policy')).toBe(csp);

        const third = await get(app, `${basePath}/docs/`);

        expect(third.headers.get('content-security-policy')).toBe(csp);
    });

    it.each(['POST', 'DELETE', 'PUT'])('answers %s below /docs with the JSON 404', async (method) => {
        const { app } = setup();

        for (const path of ['/docs', '/docs/', '/docs/swagger-ui.css']) {
            const response = await app.fetch(new Request(`http://test${path}`, { method }));

            expect(response.status).toBe(404);
            expect(response.headers.get('content-type')).toContain('application/json');
            expect(response.headers.get('content-security-policy')).toBeNull();
            expect(await response.json()).toMatchObject({ status: 404 });
        }

        // the next shell still carries the full policy
        const shell = await get(app, '/docs');
        const html = await shell.text();

        expect(shell.headers.get('content-security-policy')).toContain(`script-src 'self' ${sha256(/<script>([\s\S]*?)<\/script>/.exec(html)![1]!)};`);
    });

    it.each(['', '/api'])('sends the full policy on a HEAD before any GET, and the same on the GET and its 304 (basePath "%s")', async (basePath) => {
        const { app } = setup({ basePath });
        const head = await app.fetch(new Request(`http://test${basePath}/docs`, { method: 'HEAD' }));

        expect(head.status).toBe(200);

        const first = await get(app, `${basePath}/docs`);
        const html = await first.text();
        const csp = first.headers.get('content-security-policy');
        const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
        const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;

        expect(csp).toContain(`script-src 'self' ${sha256(script)};`);
        expect(csp).toContain(`style-src 'self' ${sha256(style)};`);
        // a HEAD before any GET already carries the policy of the shell a GET sends
        expect(head.headers.get('content-security-policy')).toBe(csp);

        const second = await get(app, `${basePath}/docs`, { 'if-none-match': first.headers.get('etag')! });

        expect(second.status).toBe(304);
        expect(second.headers.get('content-security-policy')).toBe(csp);

        const later = await app.fetch(new Request(`http://test${basePath}/docs/`, { method: 'HEAD' }));

        expect(later.headers.get('content-security-policy')).toBe(csp);
    });

    it('omits the policy on a conditional answer before any full shell was sent', async () => {
        const { app } = setup();
        const etag = (await get(setup().app, '/docs')).headers.get('etag');
        const response = await get(app, '/docs', { 'if-none-match': etag! });

        expect(response.status).toBe(304);
        // the stored shell (same etag, same body) keeps its own full policy
        expect(response.headers.get('content-security-policy')).toBeNull();
        expect((await get(app, '/docs')).headers.get('content-security-policy')).toContain('sha256-');
    });

    it('sends a CSP that allows exactly the inline blocks of the page, and the static security headers', async () => {
        const { app } = setup();
        const response = await get(app, '/docs');
        const html = await response.text();
        const csp = response.headers.get('content-security-policy') ?? '';
        const scripts = html.matchAll(/<script>([\s\S]*?)<\/script>/g).toArray().map((match) => match[1]!);
        const styles = html.matchAll(/<style>([\s\S]*?)<\/style>/g).toArray().map((match) => match[1]!);

        expect(scripts).toHaveLength(1);
        expect(styles).toHaveLength(1);

        const directives = Object.fromEntries(csp.split(';').map((part) => {
            const [name, ...values] = part.trim().split(/\s+/);

            return [name, values.join(' ')];
        }));

        expect(directives).toEqual({
            'default-src': '\'none\'',
            'script-src': `'self' ${sha256(scripts[0]!)}`,
            'style-src': `'self' ${sha256(styles[0]!)}`,
            'img-src': '\'self\' data:',
            'font-src': '\'self\'',
            'connect-src': '\'self\'',
            'base-uri': '\'self\'',
            'form-action': '\'self\'',
            'frame-ancestors': '\'none\'',
        });
        expect(csp).not.toContain('unsafe');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('referrer-policy')).toBe('no-referrer');
        expect(response.headers.get('x-frame-options')).toBe('DENY');
        expect(response.headers.get('cache-control')).toBe('no-cache');
    });

    it.each([
        ['/docs/swagger-ui.css', 'text/css'],
        ['/docs/swagger-ui-bundle.js', '/javascript'],
        ['/docs/swagger-ui-standalone-preset.js', '/javascript'],
        ['/docs/favicon-32x32.png', 'image/png'],
    ])('serves the asset %s the page loads', async (path, type) => {
        const { app } = setup({ basePath: '/api' });
        const response = await get(app, `/api${path}`);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain(type);
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        await response.arrayBuffer();
    });

    it('references only assets it serves', async () => {
        const { app } = setup({ basePath: '/api' });
        const html = await (await get(app, '/api/docs')).text();
        const references = html.matchAll(/(?:src|href)="\.\/([^"]+)"/g).toArray().map((match) => match[1]!);

        expect(references.length).toBeGreaterThan(0);

        for (const reference of references) {
            const response = await get(app, `/api/docs/${reference}`);

            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).not.toContain('text/html');
            await response.arrayBuffer();
        }
    });

    it.each([
        '/docs/index.html',
        '/docs/swagger-initializer.js',
        '/docs/oauth2-redirect.html',
        '/docs/oauth2-redirect.js',
        '/docs/package.json',
        '/docs/README.md',
        '/docs/LICENSE',
        '/docs/index.js',
        '/docs/swagger-ui-bundle.js.map',
        '/docs/log.bundle-sizes.swagger-ui.txt',
        '/docs/x',
        '/docs/a/swagger-ui.css',
        '/docs/SWAGGER-UI.CSS',
    ])('answers %s, no file of the shell, with the JSON 404', async (path) => {
        const { app } = setup();
        const response = await get(app, path);

        expect(response.status).toBe(404);
        expect(response.headers.get('content-type')).toContain('application/json');
        expect(await response.json()).toMatchObject({ status: 404 });
    });

    it('serves the document without the UI with ui: false', async () => {
        const { app } = setup({ openapi: { documentPath: DOCUMENT_PATH, ui: false } });

        expect((await get(app, '/openapi.json')).status).toBe(200);

        const docs = await get(app, '/docs');

        expect(docs.status).toBe(404);
        expect(docs.headers.get('content-type')).toContain('application/json');
    });

    it('mounts nothing and reports nothing with openapi: false', async () => {
        const { app, errors } = setup({ openapi: false });

        for (const path of ['/openapi.json', '/docs']) {
            const response = await get(app, path);

            expect(response.status).toBe(404);
            expect(await response.json()).toMatchObject({ status: 404 });
        }

        expect(errors).toEqual([]);
    });
});

describe('an unusable document', () => {
    it.each([
        ['a missing file', join(DIRECTORY, 'missing.json')],
        ['null', fixture('null.json', 'null')],
        ['an array', fixture('array.json', '[]')],
        ['truncated JSON', fixture('truncated.json', '{"a":')],
        ['a string', fixture('string.json', '"x"')],
    ])('%s: mounts nothing, reports once, serves the rest', async (_name, documentPath) => {
        const { app, errors } = setup({ openapi: { documentPath } });

        for (const path of ['/openapi.json', '/docs']) {
            const response = await get(app, path);

            expect(response.status).toBe(404);
            expect(await response.json()).toMatchObject({ status: 404 });
        }

        expect((await get(app, '/healthz')).status).toBe(200);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((errors[0] as ChamviError).code).toBe(ErrorCode.INVALID_AGENT_DEFINITION);
        expect((errors[0] as Error).message).toContain(documentPath);
        expect((errors[0] as Error).message).toContain('npm run build');
    });

    it('loadOpenApiDocument answers undefined for it', () => {
        expect(loadOpenApiDocument(join(DIRECTORY, 'missing.json'), '')).toBeUndefined();
        expect(loadOpenApiDocument(fixture('null2.json', 'null'), '')).toBeUndefined();
    });
});

describe('the default document', () => {
    it('is the package\'s built dist/swagger.json, also when the package runs from source', () => {
        expect(OPENAPI_DOCUMENT_PATH).toBe(fileURLToPath(new URL('../../../dist/swagger.json', import.meta.url)));
    });

    it('is served by default (the test target builds it first)', async () => {
        const errors: unknown[] = [];
        // `createHttpApp` without `openapi` (the test app turns it off): the product default
        const app = createHttpApp({
            engine: createTestApp().engine,
            auth: [testAuth],
            onError: (error) => {
                errors.push(error);
            },
        });
        const response = await get(app, '/openapi.json');

        expect(response.status).toBe(200);
        expect(errors).toEqual([]);
        expect((await response.json() as { openapi: string }).openapi).toMatch(/^3\./);
        expect((await get(app, '/docs')).status).toBe(200);
    });
});

describe('plugins', () => {
    it('rate-limits /openapi.json and /docs like any route', async () => {
        const { app } = setup({ rateLimit: { max: 2 } });

        expect((await get(app, '/openapi.json')).status).toBe(200);
        expect((await get(app, '/docs')).status).toBe(200);
        expect((await get(app, '/openapi.json')).status).toBe(429);
    });

    it('labels both paths by their template', () => {
        const label = (path: string) => routeLabel({ method: 'GET', path } as IAppEvent, '/api', '/metrics');

        expect(label('/api/openapi.json')).toBe('/openapi.json');
        expect(label('/api/docs')).toBe('/docs');
        expect(label('/api/docs/')).toBe('/docs');
        expect(label('/api/docs/swagger-ui.css')).toBe('/docs/*');
        expect(label('/api/docs/a/b')).toBe('/docs/*');
    });
});
