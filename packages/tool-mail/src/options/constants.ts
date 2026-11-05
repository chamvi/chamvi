/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The shape of an account id (the agent-name rule). */
export const ACCOUNT_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The largest timer Node schedules as asked (a longer one fires after 1 ms). */
export const TIMER_MAX_MS = 2_147_483_647;
