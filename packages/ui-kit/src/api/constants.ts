/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A 429 without `Retry-After`: wait out a whole rate-limit window (`@chamvi/http`'s is 60 s). */
export const RATE_LIMIT_BACKOFF_MS = 60_000;

/** How long a request waits for the API's answer (the response head); above the 30 s a connection test may take on the server. */
export const REQUEST_TIMEOUT_MS = 45_000;
