/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isObject } from 'smob';

/**
 * `dist/swagger.json` of this package, found through its own `package.json`
 * (a self-reference): the published package reads the file next to
 * `dist/index.mjs`, and a consumer that runs `@chamvi/http` from its sources
 * (a Vitest alias) reads the last built one. Where the package cannot
 * resolve itself (bundled into another file), the file next to the module.
 */
export function resolveOpenApiDocumentPath(): string {
    try {
        return join(dirname(createRequire(import.meta.url).resolve('@chamvi/http/package.json')), 'dist', 'swagger.json');
    } catch {
        return fileURLToPath(new URL('swagger.json', import.meta.url));
    }
}

/**
 * The document at `path` with `servers` set to the app's root
 * (`basePath`, or `/`); `undefined` when the file cannot be read or is not
 * a JSON object (`null`, an array, truncated JSON).
 */
export function loadOpenApiDocument(path: string, basePath: string): Record<string, unknown> | undefined {
    let document: unknown;

    try {
        document = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return undefined;
    }

    if (!isObject(document)) {
        return undefined;
    }

    return { ...document, servers: [{ url: basePath || '/' }] };
}

/** `'sha256-<base64>'` of each inline `<script>` and `<style>` block of `html`. */
function inlineHashes(html: string, pattern: RegExp): string {
    return html.matchAll(pattern).toArray()
        .map((match) => ` 'sha256-${createHash('sha256').update(match[1] ?? '', 'utf8').digest('base64')}'`)
        .join('');
}

/**
 * The Content-Security-Policy of a UI page: its own files, and of inline
 * code only the blocks this page holds (by hash), so no script or style
 * injected into the page at runtime (into the DOM) runs. It does not
 * protect the inlined document itself: its text is part of the hashed
 * block, so the document must never close that block (routup/plugins#855;
 * `document.spec.ts` checks the built one).
 */
export function buildOpenApiUiCsp(html: string): string {
    const scripts = inlineHashes(html, /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi);
    const styles = inlineHashes(html, /<style[^>]*>([\s\S]*?)<\/style>/gi);

    return [
        "default-src 'none'",
        `script-src 'self'${scripts}`,
        `style-src 'self'${styles}`,
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ].join('; ');
}
