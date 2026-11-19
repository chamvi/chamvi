/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** An authup token is fetched again this long before its `expires_in` ends (30 s), so no request carries one that expires on the way. */
export const PEER_TOKEN_REFRESH_MARGIN_MS = 30_000;
