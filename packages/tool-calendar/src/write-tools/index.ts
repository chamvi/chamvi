/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export {
    CALENDAR_CREATE_LIMIT_BUCKET,
    CALENDAR_CREATE_LIMIT_MAX,
    CALENDAR_CREATE_LIMIT_WINDOW_MS,
    CALENDAR_CREATE_MAX_ATTENDEES,
    CALENDAR_CREATE_MAX_DAYS,
    CALENDAR_DELETE_LIMIT_BUCKET,
    CALENDAR_DELETE_LIMIT_MAX,
    CALENDAR_DELETE_LIMIT_WINDOW_MS,
} from './constants.ts';
export * from './module.ts';
export type {
    CalendarCreateInput,
    CalendarDeleteInput,
    CalendarDeleteResult,
    CalendarLimitSettings,
    CalendarWriteToolsOptions,
} from './types.ts';
