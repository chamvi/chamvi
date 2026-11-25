/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { once } from '@chamvi/core';
import type { ToolContext, ToolLimit } from '@chamvi/core';
import { createBodyOf } from './approval.ts';
import { parseCalendarCreateInput } from './asserts.ts';
import {
    CALENDAR_CREATE_LIMIT_BUCKET,
    CALENDAR_CREATE_LIMIT_MAX,
    CALENDAR_CREATE_LIMIT_WINDOW_MS,
    CALENDAR_CREATE_SHOWN_ONCE,
} from './constants.ts';
import type { CalendarCreateInput, CalendarLimitSettings, CalendarWriteClientSource } from './types.ts';

/** The create approval body of `input` (the calendar's name best effort, else its id); undefined for an input that does not parse. */
async function createDetailOf(source: CalendarWriteClientSource, input: unknown, ctx: ToolContext): Promise<string | undefined> {
    try {
        const client = source(ctx);
        const parsed = parseCalendarCreateInput(input, client.timezone);
        let name = parsed.calendar;

        try {
            name = (await client.calendar(parsed.calendar, ctx.run.signal)).name;
        } catch {
            // the id stands in for the name
        }

        return createBodyOf(name, parsed, client.timezone);
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
export function calendarCreateLimitOf(source: CalendarWriteClientSource, settings: CalendarLimitSettings = {}): ToolLimit<CalendarCreateInput> {
    return {
        max: settings.max ?? CALENDAR_CREATE_LIMIT_MAX,
        windowMs: settings.windowMs ?? CALENDAR_CREATE_LIMIT_WINDOW_MS,
        bucket: settings.bucket ?? CALENDAR_CREATE_LIMIT_BUCKET,
        onExceed: 'approve',
        weight: () => 1,
        detail: async (input, ctx) => {
            const body = await createDetailOf(source, input, ctx);
            const shown = await once<boolean>(ctx, CALENDAR_CREATE_SHOWN_ONCE, async () => body !== undefined);

            return shown ? body : undefined;
        },
    };
}

/** Whether this call's limit approval showed the whole create (read in `execute`; false when it never ran). */
export async function createLimitShown(ctx: ToolContext): Promise<boolean> {
    return once<boolean>(ctx, CALENDAR_CREATE_SHOWN_ONCE, async () => false);
}
