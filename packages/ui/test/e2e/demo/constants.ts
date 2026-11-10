/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The bearer token of the demo app's only principal (`*`). */
export const E2E_TOKEN = 'e2e-token-0123456789';

export const E2E_PORT = 4173;

export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;

/** The demo app's one connection handle (`*` may read and write it). */
export const E2E_CONNECTION = 'whatsapp';

/** The pairing string the demo connection shows as its QR. */
export const E2E_QR = '2@demo-pairing-material';

/** The demo's `*-ui` page, served at `/ui/ext/<slug>`. */
export const E2E_PAGE_SLUG = 'demo';
export const E2E_PAGE_LABEL = 'Demo page';
