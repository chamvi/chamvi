/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { APPROVAL_TIMEOUT_MAX_MS } from '../approval/constants.ts';

/** How long the store lock `limit:<scope>` of one limit check is held at most. */
export const LIMIT_LOCK_TTL_MS = 10_000;

/** How often a limit check retries the held lock `limit:<scope>`, on the engine clock. */
export const LIMIT_LOCK_RETRY_MS = 100;

/** The longest scope or key of a limit use (the store's varchar width). */
export const LIMIT_KEY_MAX_LENGTH = 255;

/** What the source of a tainted run gets in place of a limit approval's body when its address is no direct one. */
export const LIMIT_APPROVAL_NOTIFICATION = 'A tool call over its limit requires review in the approval inbox.';

/** The largest `max` of a limit and the largest weight of one call (2^31 - 1). */
export const LIMIT_WEIGHT_MAX = 2_147_483_647;

/**
 * How long a limit use is kept after its creation: the longest window a
 * limit accepts, so a purge never deletes a use a window still counts.
 */
export const LIMIT_RETENTION_MS = APPROVAL_TIMEOUT_MAX_MS;
