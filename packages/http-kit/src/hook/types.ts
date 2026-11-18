/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type ClientAuthenticationHookOptions = {
    /** The bearer token of the signed-in principal, if any; asked per request. */
    token: () => Promise<string | undefined>;
    /** Asked once on a 401; `true` retries the request with the new token. */
    refresh?: () => Promise<boolean>;
    /** Called when a 401 stands after the refresh. */
    onUnauthorized?: () => void;
};
