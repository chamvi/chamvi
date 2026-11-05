/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The zone event times are given in, unless the `timezone` option says otherwise. */
export const CALENDAR_DEFAULT_TIMEZONE = 'Europe/Berlin';

/** Milliseconds one call may take per account (`timeoutMs`). */
export const CALENDAR_TIMEOUT_MS = 30_000;

/** The largest timer Node schedules as asked (a longer one fires after 1 ms). */
export const TIMER_MAX_MS = 2_147_483_647;
