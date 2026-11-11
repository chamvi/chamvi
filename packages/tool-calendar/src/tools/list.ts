/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { defineTool } from '@chamvi/core';
import type { ICalendarClient } from '../client/types.ts';
import {
    clientOf,
    objectSchema,
    signalOf,
    taintOf,
} from './asserts.ts';
import { UNTRUSTED_NOTE } from './constants.ts';
import type { CalendarListResult } from './types.ts';

export function calendarListTool(client: ICalendarClient | undefined): Tool<Record<string, never>, CalendarListResult> {
    return defineTool<Record<string, never>, CalendarListResult>({
        // calendar names and invites come from other people
        trust: { taint: taintOf(client) },
        description: 'List the calendars of the configured accounts: calendar id (for calendar_events), account, name, ' +
            `color and zone. ${UNTRUSTED_NOTE}`,
        inputSchema: objectSchema<Record<string, never>>({}),
        execute: async (_input, { abortSignal, context }) => {
            const calendars = await clientOf(client, context).calendars({ signal: signalOf(abortSignal, context) });

            return { calendars };
        },
    });
}
