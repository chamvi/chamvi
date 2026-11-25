/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { approve } from '@chamvi/core';
import type { ApprovalDecision, ApprovalRequestInput, ToolContext } from '@chamvi/core';
import type { CalendarDeleteItem, CalendarTime } from '../write-client/types.ts';
import {
    CALENDAR_APPROVAL_FIELD_MAX_CHARS,
    CALENDAR_DESCRIPTION_SEPARATOR,
    CALENDAR_NOTIFIED_MAX_SHOWN,
    CALENDAR_NOTIFY_NOTE,
} from './constants.ts';
import type { ParsedCreate } from './types.ts';

/**
 * One line of untrusted text: control, line separator, zero-width and
 * direction characters as spaces, cut at `CALENDAR_APPROVAL_FIELD_MAX_CHARS`
 * characters.
 */
export function lineOf(value: string): string {
    // eslint-disable-next-line no-control-regex
    const line = value.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, ' ');

    return Array.from(line).slice(0, CALENDAR_APPROVAL_FIELD_MAX_CHARS).join('');
}

/**
 * Asks the owner through the run's source channel when its address reaches
 * the owner alone (`handle.direct()`), else through the inbox and the API only
 * (`approve()`). A channel that cannot render the request throws its
 * ValidationError before the call suspends.
 */
export async function askCalendarApproval(ctx: ToolContext, request: ApprovalRequestInput): Promise<ApprovalDecision> {
    const handle = ctx.channels.findOne();

    if (handle && await handle.direct()) {
        return handle.approve(request);
    }

    return approve(ctx, request);
}

function minuteOf(instant: Temporal.Instant, zone: string): string {
    const time = instant.toZonedDateTimeISO(zone);

    return `${time.toPlainDate().toString()} ${time.toPlainTime().toString({ smallestUnit: 'minute' })}`;
}

/**
 * When an event takes place, for an approval: `YYYY-MM-DD HH:MM to YYYY-MM-DD
 * HH:MM (<zone>)`, or for all-day events `YYYY-MM-DD, all day` and
 * `YYYY-MM-DD to YYYY-MM-DD, all day` (the last day inclusive).
 */
export function whenOf(start: CalendarTime, end: CalendarTime, zone: string): string {
    if (start.kind === 'date' && end.kind === 'date') {
        const last = end.date.subtract({ days: 1 });

        return Temporal.PlainDate.compare(last, start.date) <= 0 ?
            `${start.date.toString()}, all day` :
            `${start.date.toString()} to ${last.toString()}, all day`;
    }

    if (start.kind === 'instant' && end.kind === 'instant') {
        return `${minuteOf(start.instant, zone)} to ${minuteOf(end.instant, zone)} (${zone})`;
    }

    return '';
}

/** The body of a create approval (also the detail of its limit approval): every field, never cut. */
export function createBodyOf(calendarName: string, parsed: ParsedCreate, zone: string): string {
    const lines = [
        `Calendar: ${lineOf(calendarName)} (${parsed.calendar})`,
        `Title: ${parsed.title}`,
        `When: ${whenOf(parsed.start, parsed.end, zone)}`,
    ];

    if (parsed.location !== undefined) {
        lines.push(`Where: ${parsed.location}`);
    }

    if (parsed.attendees.length > 0) {
        lines.push(`Attendees: ${parsed.attendees.join(', ')}`);
    }

    if (parsed.description !== undefined) {
        lines.push(CALENDAR_DESCRIPTION_SEPARATOR, parsed.description);
    }

    return lines.join('\n');
}

/** The approval of a create with attendees: the calendar, the count of invitations and the whole event. */
export function createApprovalOf(view: { name: string }, parsed: ParsedCreate, zone: string): ApprovalRequestInput {
    return {
        title: `Create event in ${lineOf(view.name)} and invite ${parsed.attendees.length}?`,
        body: createBodyOf(view.name, parsed, zone),
    };
}

function minuteOfIso(value: string): string {
    return `${value.slice(0, 10)} ${value.slice(11, 16)}`;
}

function attendeesOf(count: number): string {
    if (count === 0) {
        return 'no attendees';
    }

    return count === 1 ? '1 attendee' : `${count} attendees`;
}

/** When a listed event takes place: as `whenOf`, a series by its first start followed by ` (repeats)`. */
function deleteWhenOf(item: CalendarDeleteItem, zone: string): string {
    if (item.recurring) {
        return `${item.allDay ? item.start : minuteOfIso(item.start)} (repeats)`;
    }

    if (item.allDay) {
        return whenOf(
            { kind: 'date', date: Temporal.PlainDate.from(item.start) },
            { kind: 'date', date: Temporal.PlainDate.from(item.end) },
            zone,
        );
    }

    return `${minuteOfIso(item.start)} to ${minuteOfIso(item.end)} (${zone})`;
}

/** `Notified: a, b and N more`: at most CALENDAR_NOTIFIED_MAX_SHOWN printable addresses, the rest counted. */
function notifiedOf(addresses: string[]): string {
    const shown = addresses
        .filter((address) => /^[\x21-\x7E]+$/.test(address))
        .slice(0, CALENDAR_NOTIFIED_MAX_SHOWN)
        .map((address) => lineOf(address));
    const rest = addresses.length - shown.length;

    if (shown.length === 0) {
        return `Notified: ${rest} ${rest === 1 ? 'person' : 'people'}`;
    }

    return `Notified: ${shown.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`;
}

/**
 * The listing of a delete: the line `<when> | <title> | <attendees> | <calendar name>`, each field one line of
 * at most 200 characters; with others in the event also who the server may notify.
 */
export function deleteListingOf(item: CalendarDeleteItem, zone: string): string {
    const line = [
        lineOf(deleteWhenOf(item, zone)),
        lineOf(item.title),
        attendeesOf(item.attendees),
        lineOf(item.calendarName),
    ].join(' | ');

    if (!item.others) {
        return line;
    }

    return [line, notifiedOf(item.notified), CALENDAR_NOTIFY_NOTE].join('\n');
}

/** The approval of a delete: the event (a series as such) and its listing line. */
export function deleteApprovalOf(item: CalendarDeleteItem, zone: string): ApprovalRequestInput {
    const name = lineOf(item.calendarName);

    return {
        title: item.recurring ?
            `Delete a repeating event (every occurrence) from ${name}?` :
            `Delete 1 event from ${name}?`,
        body: deleteListingOf(item, zone),
    };
}
