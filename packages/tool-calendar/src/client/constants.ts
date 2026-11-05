/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The only HTTP methods the calendar client sends: reads. */
export const CALENDAR_ALLOWED_METHODS: readonly string[] = ['PROPFIND', 'REPORT', 'GET'];

/** The widest `from`..`to` range `calendar_events` reads, in days. */
export const CALENDAR_RANGE_MAX_DAYS = 92;

/** Events `calendar_events` returns by default. */
export const CALENDAR_EVENTS_DEFAULT_LIMIT = 100;

/** Events `calendar_events` returns at most. */
export const CALENDAR_EVENTS_MAX_LIMIT = 500;
