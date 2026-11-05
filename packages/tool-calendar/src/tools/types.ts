/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { CalendarEvent } from '../expand/types.ts';
import type { CalendarView } from '../client/types.ts';

export type CalendarListResult = {
    calendars: CalendarView[];
};

export type CalendarEventsToolInput = {
    from: string;
    to: string;
    calendar?: string;
    limit?: number;
};

export type CalendarEventsToolResult = {
    events: CalendarEvent[];
    truncated: boolean;
};
