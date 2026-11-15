/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { resolveOpenApiDocumentPath } from './helpers.ts';

/** @internal The built document (`dist/swagger.json` of this package), see `resolveOpenApiDocumentPath()`. */
export const OPENAPI_DOCUMENT_PATH: string = resolveOpenApiDocumentPath();

/** @internal Where the document is served, under `basePath`. */
export const OPENAPI_DOCUMENT_ROUTE = '/openapi.json';

/** @internal Where the UI is mounted, under `basePath`. */
export const OPENAPI_UI_PATH = '/docs';

/**
 * @internal The Content-Security-Policy of every file the UI answers (the
 * plugin's `csp` option, also on a 304 and a HEAD): the shell has no inline
 * script or style, so its own files only. Stricter than the plugin's
 * recommended one: `default-src 'none'`, no `blob:`, no `frame-ancestors`.
 */
export const OPENAPI_UI_CSP = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ');
