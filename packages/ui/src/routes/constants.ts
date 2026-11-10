/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const DEFAULT_UI_BASE_PATH = '/ui';

/** Hashed assets (`assets/`) never change under their name. */
export const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** `index.html` and unhashed files revalidate on every load. */
export const DOCUMENT_CACHE_CONTROL = 'no-cache';

/** @internal How long a missing build is answered from memory before the folder is read again. */
export const BUILD_RETRY_MS = 5000;

/** @internal Lower case only: routup matches case-insensitively and the path is echoed into `<base>`. */
export const UI_BASE_PATH_PATTERN = /^(?:\/[a-z0-9._~-]+)+$/;
