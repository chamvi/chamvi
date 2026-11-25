/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import ICAL from 'ical.js';
import { parseCalendarEventId } from '../event-id/module.ts';
import type { CalendarEventRef } from '../event-id/types.ts';
import { CALENDAR_FIELD_MAX_CHARS } from '../expand/constants.ts';
import { formatEventTime, instantOf } from '../expand/module.ts';
import { CALENDAR_NO_EVENT_MESSAGE } from './constants.ts';
import {
    assertResourceName,
    discardBody,
    readResourceBody,
    resourceRequest,
    resourceUrlOf,
    statusError,
} from './resource.ts';
import type { CalendarWriteSessions } from './session.ts';
import type { CalendarDeleteItem, CalendarWriteView } from './types.ts';

const TOOL = 'calendar_delete';

type Component = InstanceType<typeof ICAL.Component>;

/**
 * The parts of the event id `event` for a delete (ValidationError, before any
 * request): a readable id, a known account, a resource name a write may use.
 */
export function calendarDeleteTargetOf(sessions: CalendarWriteSessions, event: unknown): CalendarEventRef {
    const ref = parseCalendarEventId(event);

    sessions.account(ref.account);
    assertResourceName(ref.name);

    return ref;
}

function cut(text: string, max: number): string {
    if (text.length <= max) {
        return text;
    }

    const code = text.charCodeAt(max - 1);

    return text.slice(0, code >= 0xD800 && code <= 0xDBFF ? max - 1 : max);
}

function addressOf(value: unknown): string {
    return typeof value === 'string' ? value.replace(/^mailto:/i, '').trim().toLowerCase() : '';
}

function tzidOf(component: Component, name: string): string | undefined {
    const tzid = component.getFirstProperty(name)?.getParameter('tzid');

    return typeof tzid === 'string' && tzid.length > 0 ? tzid : undefined;
}

function veventsOf(data: Uint8Array): Component[] {
    try {
        const parsed: unknown = ICAL.parse(Buffer.from(data).toString('utf8'));
        const list = Array.isArray(parsed) && Array.isArray(parsed[0]) ? parsed : [parsed];

        return list.flatMap((jcal) => new ICAL.Component(jcal as unknown[]).getAllSubcomponents('vevent'));
    } catch {
        return [];
    }
}

type DescribeContext = {
    event: string;
    view: CalendarWriteView;
    /** The calendar is shared with the account by someone else. */
    shared: boolean;
    name: string;
    etag: string;
    zone: string;
    now: number;
    /** The account user and its calendar user addresses, lower-cased, without `mailto:`. */
    self: Set<string>;
};

/** The delete item of the resource `data` (ValidationError `CALENDAR_NO_EVENT_MESSAGE` without a readable VEVENT). */
export function calendarDeleteItemOf(data: Uint8Array, context: DescribeContext): CalendarDeleteItem {
    const vevents = veventsOf(data);
    const master = vevents.find((vevent) => !vevent.hasProperty('recurrence-id')) ?? vevents[0];

    if (!master || !(master.getFirstPropertyValue('dtstart') instanceof ICAL.Time)) {
        throw new ValidationError(CALENDAR_NO_EVENT_MESSAGE);
    }

    const event = new ICAL.Event(master);
    const startTzid = tzidOf(master, 'dtstart');
    const endTzid = master.hasProperty('dtend') ? tzidOf(master, 'dtend') ?? startTzid : startTzid;
    const people = [
        ...vevents.flatMap((vevent) => vevent.getAllProperties('organizer')),
        ...vevents.flatMap((vevent) => vevent.getAllProperties('attendee')),
    ].map((property) => property.getFirstValue());
    const others = people.some((value) => !context.self.has(addressOf(value)));
    const seen = new Set<string>(context.self);
    const notified: string[] = [];

    for (const value of people) {
        const address = typeof value === 'string' ? value.replace(/^mailto:/i, '').trim() : '';

        if (!seen.has(address.toLowerCase())) {
            seen.add(address.toLowerCase());
            notified.push(address);
        }
    }

    const summary = master.getFirstPropertyValue('summary');

    return {
        event: context.event,
        calendar: context.view.calendar,
        calendarName: context.view.name,
        name: context.name,
        etag: context.etag,
        title: cut(typeof summary === 'string' ? summary : '', CALENDAR_FIELD_MAX_CHARS),
        start: formatEventTime(event.startDate, startTzid, context.zone),
        end: formatEventTime(event.endDate, endTzid, context.zone),
        allDay: event.startDate.isDate,
        attendees: master.getAllProperties('attendee').length,
        others,
        notified,
        shared: context.shared,
        recurring: vevents.length > 1 || vevents.some((vevent) => ['rrule', 'rdate', 'recurrence-id'].some((name) => vevent.hasProperty(name))),
        ended: instantOf(event.endDate, endTzid, context.zone).epochMilliseconds <= context.now,
        data,
    };
}

/**
 * The event the id `event` names, as it is now: GET of its resource (`404`
 * undefined, a body above `CALENDAR_EVENT_MAX_BYTES` `too large`, no ETag
 * `request failed`). The ETag comparison with the id is the tool's.
 */
export async function describeCalendarEvent(
    sessions: CalendarWriteSessions,
    event: string,
    signal: AbortSignal | undefined,
): Promise<CalendarDeleteItem | undefined> {
    const ref = calendarDeleteTargetOf(sessions, event);
    const account = sessions.account(ref.account);

    return sessions.run(TOOL, ref.account, signal, async (inner) => {
        const entry = await sessions.calendar(ref.account, ref.calendar, inner);
        const response = await resourceRequest(sessions.fetch, account, {
            method: 'GET',
            url: resourceUrlOf(entry.view, ref.name),
            headers: {},
            signal: inner,
        });

        if (response.status === 404) {
            await discardBody(response);

            return undefined;
        }

        const etag = response.headers.get('etag');

        if (response.status !== 200 || !etag) {
            await discardBody(response);

            throw statusError(TOOL, ref.account, response.status === 200 ? 0 : response.status);
        }

        const data = await readResourceBody(response, TOOL, ref.account);
        const addresses = await sessions.addresses(ref.account, inner);
        // read now: a calendar shared after discovery must not count as the account's own
        const shared = await sessions.shared(ref.account, entry, inner);

        return calendarDeleteItemOf(data, {
            event,
            view: entry.view,
            shared,
            name: ref.name,
            etag,
            zone: sessions.options.timezone,
            now: sessions.options.clock.now(),
            self: new Set([account.user, ...addresses].map(addressOf).filter((address) => address.length > 0)),
        });
    });
}
