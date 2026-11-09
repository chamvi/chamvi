/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Every tool `utilityTools()` can build. */
export const UTILITY_TOOL_NAMES = [
    'current_time',
    'time_convert',
    'date_add',
    'date_diff',
    'date_info',
    'next_weekday',
    'calculate',
    'run_info',
] as const;

/** English weekday names, Monday first (Temporal's dayOfWeek is 1 to 7). */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** The cron channel's default name (`@chamvi/channel-cron`'s `CRON_CHANNEL_NAME`; no dependency on it). */
export const CRON_CHANNEL = 'cron';
