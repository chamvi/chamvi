/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Waits before the 1st, 2nd, ... reconnect; the last repeats. */
export const RECONNECT_DELAYS_MS: readonly number[] = [1000, 2000, 5000, 10_000];

/** Answers that never get better by reconnecting. */
export const FATAL_STREAM_STATUSES: readonly number[] = [400, 401, 403, 404];
