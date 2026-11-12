/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Every key the dashboard keeps in `sessionStorage` starts with this; sign-out removes them all. */
export const STORAGE_PREFIX = 'chamvi.';

export const TOKEN_STORAGE_KEY = 'chamvi.token';

/** Where to go after the authup round-trip (it loses the query). */
export const RETURN_STORAGE_KEY = 'chamvi.return';

/** The authup kit's "cookies" (tokens, expiry, realm) live in `sessionStorage` under this prefix. */
export const AUTHUP_STORAGE_PREFIX = 'chamvi.authup.';

/** The route a visit without a principal goes to; a router using the guard must name it so. */
export const LOGIN_ROUTE_NAME = 'login';

/** How often a mounted permission verdict is evaluated again: a `date` or `time` policy changes it without any input changing. */
export const VERDICT_REFRESH_MS = 60_000;
