/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { defineTool } from '@chamvi/core';
import { CALENDAR_EVENTS_DEFAULT_LIMIT, CALENDAR_EVENTS_MAX_LIMIT, CALENDAR_RANGE_MAX_DAYS } from '../client/constants.ts';
import type { ICalendarClient } from '../client/types.ts';
import { CALENDAR_DESCRIPTION_MAX_CHARS, CALENDAR_FIELD_MAX_CHARS } from '../expand/constants.ts';
import {
    clientOf,
    inputObject,
    objectSchema,
    optionalString,
    requireString,
    signalOf,
    taintOf,
} from './asserts.ts';
import { UNTRUSTED_NOTE } from './constants.ts';
import type { CalendarEventsToolInput, CalendarEventsToolResult } from './types.ts';

export function calendarEventsTool(client: ICalendarClient | undefined): Tool<CalendarEventsToolInput, CalendarEventsToolResult> {
    return defineTool<CalendarEventsToolInput, CalendarEventsToolResult>({
        trust: { taint: taintOf(client) },
        description: `Read the events between from and to (at most ${CALENDAR_RANGE_MAX_DAYS} days), recurring ones ` +
            'expanded, sorted by start: title, start, end (exclusive), allDay, location, description ' +
            `(at most ${CALENDAR_DESCRIPTION_MAX_CHARS} characters), status (CANCELLED ones are kept), organizer and ` +
            'attendees (count and your own status). Title, location and organizer are cut at ' +
            `${CALENDAR_FIELD_MAX_CHARS} characters. Times are ISO with the offset of the configured zone; ` +
            `all-day events give plain dates. truncated says more events matched than limit. ${UNTRUSTED_NOTE}`,
        inputSchema: objectSchema<CalendarEventsToolInput>({
            from: {
                type: 'string',
                minLength: 1,
                description: 'An ISO date (2026-11-05, midnight in the configured zone) or date-time (2026-11-05T09:00:00+01:00).',
            },
            to: {
                type: 'string',
                minLength: 1,
                description: 'The end of the range, exclusive, as from.',
            },
            calendar: {
                type: 'string',
                minLength: 1,
                description: 'A calendar id from calendar_list. Default: every calendar.',
            },
            limit: {
                type: 'integer',
                minimum: 1,
                maximum: CALENDAR_EVENTS_MAX_LIMIT,
                description: `Events to return at most. Default ${CALENDAR_EVENTS_DEFAULT_LIMIT}.`,
            },
        }, ['from', 'to']),
        execute: async (input, { abortSignal, context }) => {
            const body = inputObject(input);

            return clientOf(client, context).events({
                from: requireString(body.from, 'from'),
                to: requireString(body.to, 'to'),
                calendar: optionalString(body.calendar, 'calendar'),
                limit: body.limit as number | undefined,
                signal: signalOf(abortSignal, context),
            });
        },
    });
}
