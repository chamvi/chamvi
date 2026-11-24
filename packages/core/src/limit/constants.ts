/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** How long the store lock `limit:<scope>` of one limit check is held at most. */
export const LIMIT_LOCK_TTL_MS = 10_000;

/** How often a limit check retries the held lock `limit:<scope>`, on the engine clock. */
export const LIMIT_LOCK_RETRY_MS = 100;

/** The longest scope or key of a limit use (the store's varchar width). */
export const LIMIT_KEY_MAX_LENGTH = 255;
