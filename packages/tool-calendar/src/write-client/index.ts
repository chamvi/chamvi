/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export {
    CALENDAR_ADDRESS_PATTERN,
    CALENDAR_CHANGED_MESSAGE,
    CALENDAR_EVENT_MAX_BYTES,
    CALENDAR_WRITE_ALLOWED_METHODS,
} from './constants.ts';
export { createCalendarWriteClient } from './module.ts';
export type {
    CalendarCreateRequest,
    CalendarCreateResult,
    CalendarDeleteItem,
    CalendarTime,
    CalendarWriteView,
    ICalendarWriteClient,
} from './types.ts';
