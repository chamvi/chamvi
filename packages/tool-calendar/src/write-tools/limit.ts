/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { once } from '@chamvi/core';
import type { ToolContext, ToolLimit } from '@chamvi/core';
import { isObject } from 'smob';
import { parseCalendarEventId } from '../event-id/module.ts';
import { createBodyOf, deleteListingOf, lineOf } from './approval.ts';
import { parseCalendarCreateInput } from './asserts.ts';
import {
    CALENDAR_CREATE_LIMIT_BUCKET,
    CALENDAR_CREATE_LIMIT_MAX,
    CALENDAR_CREATE_LIMIT_WINDOW_MS,
    CALENDAR_CREATE_SHOWN_ONCE,
    CALENDAR_DELETE_LIMIT_BUCKET,
    CALENDAR_DELETE_LIMIT_MAX,
    CALENDAR_DELETE_LIMIT_WINDOW_MS,
    CALENDAR_DELETE_LISTING_ONCE,
} from './constants.ts';
import type {
    CalendarCreateInput,
    CalendarDeleteInput,
    CalendarDeleteShown,
    CalendarLimitSettings,
    CalendarWritable,
    CalendarWriteClientSource,
} from './types.ts';

/**
 * The create approval body of `input` (the calendar's name best effort, else its id; with attendees the
 * organizer, without which the body is not the whole invitation); undefined for an input that does not parse.
 */
async function createDetailOf(
    source: CalendarWriteClientSource,
    writable: CalendarWritable,
    input: unknown,
    ctx: ToolContext,
): Promise<{ body: string; whole: boolean } | undefined> {
    try {
        const client = source(ctx);
        const parsed = parseCalendarCreateInput(input, client.timezone);
        let name = parsed.calendar;
        let organizer: string | undefined;

        // a calendar the tools may not write to is not looked up (execute refuses it)
        if (writable(parsed.calendar)) {
            try {
                const view = await client.calendar(parsed.calendar, ctx.run.signal);

                name = view.name;

                if (parsed.attendees.length > 0) {
                    organizer = await client.organizer(view.account, ctx.run.signal);
                }
            } catch {
                // the id stands in for the name; without the organizer the invitation is asked again
            }
        }

        return {
            body: createBodyOf(name, parsed, client.timezone, organizer),
            whole: parsed.attendees.length === 0 || organizer !== undefined,
        };
    } catch {
        return undefined;
    }
}

/**
 * The limit `calendar_create` carries (internal): at most `max` creates
 * (default 20) per `windowMs` (default one hour) in `bucket` (default
 * `creates`), each weighing 1, over it an approval showing the whole create.
 * Whether it showed the whole call is recorded per call (`once()`), so
 * `execute` skips the invitation approval only after a limit approval that
 * showed every attendee.
 */
export function calendarCreateLimitOf(
    source: CalendarWriteClientSource,
    writable: CalendarWritable,
    settings: CalendarLimitSettings = {},
): ToolLimit<CalendarCreateInput> {
    return {
        max: settings.max ?? CALENDAR_CREATE_LIMIT_MAX,
        windowMs: settings.windowMs ?? CALENDAR_CREATE_LIMIT_WINDOW_MS,
        bucket: settings.bucket ?? CALENDAR_CREATE_LIMIT_BUCKET,
        onExceed: 'approve',
        weight: () => 1,
        detail: async (input, ctx) => {
            const detail = await createDetailOf(source, writable, input, ctx);

            await once<boolean>(ctx, CALENDAR_CREATE_SHOWN_ONCE, async () => detail?.whole ?? false);

            return detail?.body;
        },
    };
}

/** Whether this call's limit approval showed the whole create (read in `execute`; false when it never ran). */
export async function createLimitShown(ctx: ToolContext): Promise<boolean> {
    return once<boolean>(ctx, CALENDAR_CREATE_SHOWN_ONCE, async () => false);
}

/** The event id of a delete input; '' for a malformed one (the tool refuses it). */
function eventOf(input: unknown): string {
    return isObject(input) && typeof input.event === 'string' ? input.event : '';
}

/** `<calendar id> event <resource name>` from the id alone; an unreadable id as one cut line. */
function fallbackListingOf(event: string): string {
    try {
        const ref = parseCalendarEventId(event);

        return `${lineOf(ref.calendar)} event ${lineOf(ref.name)}`;
    } catch {
        return lineOf(event);
    }
}

/**
 * The limit `calendar_delete` carries (internal): at most `max` deletes
 * (default 20) per `windowMs` (default one hour) in `bucket` (default
 * `deletes`, shared with `mail_delete`), each weighing 1, over it an approval
 * with the event's listing line through the tools' own client. What it showed
 * is recorded per call (`once()`): the event of a real listing, or null when
 * only the fallback could be shown, so `execute` skips its own checks only
 * after an approval that showed the event.
 */
export function calendarDeleteLimitOf(
    source: CalendarWriteClientSource,
    writable: CalendarWritable,
    settings: CalendarLimitSettings = {},
): ToolLimit<CalendarDeleteInput> {
    return {
        max: settings.max ?? CALENDAR_DELETE_LIMIT_MAX,
        windowMs: settings.windowMs ?? CALENDAR_DELETE_LIMIT_WINDOW_MS,
        bucket: settings.bucket ?? CALENDAR_DELETE_LIMIT_BUCKET,
        onExceed: 'approve',
        weight: () => 1,
        // the approval's body: the listing line, else what the id alone tells; never a throw
        detail: async (input, ctx: ToolContext) => {
            const event = eventOf(input);
            const shown = await once<CalendarDeleteShown | null>(ctx, CALENDAR_DELETE_LISTING_ONCE, async () => {
                try {
                    // a calendar the tools may not write to is not read (execute refuses it)
                    if (!writable(parseCalendarEventId(event).calendar)) {
                        return null;
                    }

                    const client = source(ctx);
                    const item = await client.describe(event, ctx.run.signal);

                    if (!item) {
                        return null;
                    }

                    return { event, text: deleteListingOf(item, client.timezone) };
                } catch {
                    return null;
                }
            });

            // asked again in the same call: the recorded listing, so what covers the call is what is shown
            return shown === null || shown.event !== event ? fallbackListingOf(event) : shown.text;
        },
    };
}

/** Whether the limit approval of this call listed `event` (read in `execute`, null when it never ran). */
export async function limitListingCovers(ctx: ToolContext, event: string): Promise<boolean> {
    const shown = await once<CalendarDeleteShown | null>(ctx, CALENDAR_DELETE_LISTING_ONCE, async () => null);

    return shown !== null && shown.event === event;
}
