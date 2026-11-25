/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { approve } from '@chamvi/core';
import type { ApprovalDecision, ApprovalRequestInput, ToolContext } from '@chamvi/core';
import type { CalendarTime } from '../write-client/types.ts';
import { CALENDAR_APPROVAL_FIELD_MAX_CHARS, CALENDAR_DESCRIPTION_SEPARATOR } from './constants.ts';
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
