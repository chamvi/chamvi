/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import { isObject } from 'smob';
import { parseInstant } from '../client/asserts.ts';
import { CALENDAR_DESCRIPTION_MAX_CHARS, CALENDAR_FIELD_MAX_CHARS } from '../expand/constants.ts';
import { isCalendarAddress } from '../write-client/asserts.ts';
import type { CalendarTime } from '../write-client/types.ts';
import { CALENDAR_CREATE_MAX_ATTENDEES, CALENDAR_CREATE_MAX_DAYS } from './constants.ts';
import type { ParsedCreate } from './types.ts';

const TOOL = 'calendar_create';

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

// control (C0, C1, line and paragraph separators), zero-width and bidi characters
// eslint-disable-next-line no-control-regex
const NOT_ONE_LINE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2066-\u2069]/;

// as NOT_ONE_LINE, but LF and tab are allowed; CR stays refused (ical.js would not escape a bare one)
// eslint-disable-next-line no-control-regex
const NOT_TEXT = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2066-\u2069]/;

function lineOf(value: unknown, name: string, required: boolean): string | undefined {
    if (value === undefined && !required) {
        return undefined;
    }

    if (typeof value !== 'string' || value.length === 0 || value.length > CALENDAR_FIELD_MAX_CHARS || NOT_ONE_LINE.test(value)) {
        throw new ValidationError(`${TOOL}: ${name} must be one line of 1 to ${CALENDAR_FIELD_MAX_CHARS} characters without ` +
            'control, zero-width or direction characters.');
    }

    return value;
}

function descriptionOf(value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string' || value.length === 0 || value.length > CALENDAR_DESCRIPTION_MAX_CHARS || NOT_TEXT.test(value)) {
        throw new ValidationError(`${TOOL}: description must be 1 to ${CALENDAR_DESCRIPTION_MAX_CHARS} characters; newlines and ` +
            'tabs are allowed, carriage returns and other control, zero-width or direction characters are not.');
    }

    return value;
}

function attendeesOf(value: unknown): string[] {
    if (value === undefined) {
        return [];
    }

    if (!Array.isArray(value) || value.length === 0 || value.length > CALENDAR_CREATE_MAX_ATTENDEES) {
        throw new ValidationError(`${TOOL}: attendees must be a list of 1 to ${CALENDAR_CREATE_MAX_ATTENDEES} addresses; leave it out to invite nobody.`);
    }

    const seen = new Set<string>();
    const attendees: string[] = [];

    value.forEach((address: unknown, index) => {
        if (!isCalendarAddress(address)) {
            throw new ValidationError(`${TOOL}: attendees[${index}] must be one bare address (alice@example.com).`);
        }

        const key = address.toLowerCase();

        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        attendees.push(address);
    });

    return attendees;
}

function timeOf(value: unknown, name: string, allDay: boolean, zone: string): CalendarTime {
    if (allDay) {
        if (typeof value === 'string' && PLAIN_DATE.test(value)) {
            try {
                return { kind: 'date', date: Temporal.PlainDate.from(value, { overflow: 'reject' }) };
            } catch {
                // reported below
            }
        }

        throw new ValidationError(`${TOOL}: ${name} must be a date (2026-11-05) with allDay: true.`);
    }

    if (typeof value === 'string' && PLAIN_DATE.test(value)) {
        throw new ValidationError(`${TOOL}: ${name} must be a date-time (2026-11-05T09:00); use allDay: true for whole days.`);
    }

    return { kind: 'instant', instant: parseInstant(value, `${TOOL}: ${name}`, zone) };
}

function spanOf(start: CalendarTime, end: CalendarTime): { after: boolean; days: number } {
    if (start.kind === 'date' && end.kind === 'date') {
        const { days } = start.date.until(end.date, { largestUnit: 'days' });

        return { after: days > 0, days };
    }

    if (start.kind === 'instant' && end.kind === 'instant') {
        const ms = end.instant.epochMilliseconds - start.instant.epochMilliseconds;

        return { after: ms > 0, days: ms / 86_400_000 };
    }

    return { after: false, days: 0 };
}

/**
 * A `calendar_create` input checked (ValidationError naming the field, before
 * any request or approval). Times without an offset are read in `zone`.
 */
export function parseCalendarCreateInput(input: unknown, zone: string): ParsedCreate {
    if (!isObject(input)) {
        throw new ValidationError(`${TOOL}: the input must be an object.`);
    }

    const { calendar, allDay = false } = input;

    if (typeof calendar !== 'string' || calendar.length === 0) {
        throw new ValidationError(`${TOOL}: calendar must be a calendar id from calendar_list.`);
    }

    if (typeof allDay !== 'boolean') {
        throw new ValidationError(`${TOOL}: allDay must be true or false.`);
    }

    const title = lineOf(input.title, 'title', true) as string;
    const location = lineOf(input.location, 'location', false);
    const description = descriptionOf(input.description);
    const attendees = attendeesOf(input.attendees);
    const start = timeOf(input.start, 'start', allDay, zone);
    const end = timeOf(input.end, 'end', allDay, zone);
    const span = spanOf(start, end);

    if (!span.after) {
        throw new ValidationError(`${TOOL}: end must be after start.`);
    }

    if (span.days > CALENDAR_CREATE_MAX_DAYS) {
        throw new ValidationError(`${TOOL}: end must be at most ${CALENDAR_CREATE_MAX_DAYS} days after start.`);
    }

    return {
        calendar,
        title,
        allDay,
        start,
        end,
        ...(location !== undefined && { location }),
        ...(description !== undefined && { description }),
        attendees,
    };
}
