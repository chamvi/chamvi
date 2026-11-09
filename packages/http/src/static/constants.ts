/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** @internal Hashed assets (`assets/`) never change under their name. */
export const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** @internal `index.html` and unhashed files revalidate on every load. */
export const DOCUMENT_CACHE_CONTROL = 'no-cache';

/** @internal How long a missing build is answered from memory before the folder is read again. */
export const BUILD_RETRY_MS = 5000;

/** @internal */
export const MEDIA_TYPES: Readonly<Record<string, string>> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.map': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.txt': 'text/plain; charset=utf-8',
};

/** @internal */
export const DEFAULT_MEDIA_TYPE = 'application/octet-stream';

/** On every answer of a static page, next to the CSP. */
export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
    'x-content-type-options': 'nosniff',
    // an approval link's ids must never leave as a referrer
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
};

/** @internal The comment a page's `index.html` holds where the config goes (`@chamvi/ui`'s `CONFIG_MARKER`). */
export const STATIC_CONFIG_MARKER = '<!--chamvi-config-->';

/** @internal The id of the config's script block (`@chamvi/ui`'s `CONFIG_ELEMENT_ID`). */
export const STATIC_CONFIG_ELEMENT_ID = 'chamvi-config';

/** @internal Lower case only: routup matches case-insensitively and the path is echoed into `<base>`. */
export const STATIC_PATH_PATTERN = /^(?:\/[a-z0-9._~-]+)+$/;
