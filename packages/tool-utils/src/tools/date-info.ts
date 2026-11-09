/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { defineTool } from '@chamvi/core';
import { inputObject, objectSchema } from './asserts.ts';
import { dateOrToday, optionalString, zoneOf } from './dates.ts';
import type { UtilityToolsOptionsNormalized } from '../options/types.ts';
import type { DateInfoResult } from './types.ts';
import { describeInstant } from './zone.ts';

type DateInfoInput = {
    date?: string;
    timezone?: string;
};

export function dateInfoTool(options: UtilityToolsOptionsNormalized): Tool<DateInfoInput, DateInfoResult> {
    return defineTool<DateInfoInput, DateInfoResult>({
        description: 'Facts about a calendar date: weekday, ISO week number and week year, day of the year, ' +
            'days in the month and whether it is a leap year. Call it for "what weekday is ..." or "which week is ...". ' +
            `Without date it is today in the given IANA timezone, else ${options.timezone}.`,
        inputSchema: objectSchema<DateInfoInput>({
            date: { type: 'string', description: 'YYYY-MM-DD, YYYY-MM-DDTHH:MM or an instant with an offset or Z. Default today.' },
            timezone: { type: 'string', description: `An IANA time zone id. Default ${options.timezone}.` },
        }),
        execute: async (input, { context }) => {
            const body = inputObject(input ?? {});
            const zone = zoneOf(body, options.timezone);
            const day = dateOrToday(optionalString(body.date, 'date'), 'date', zone, context);

            return {
                date: day.toString(),
                weekday: describeInstant(day.toZonedDateTime(zone).toInstant(), zone).weekday,
                isoWeek: day.weekOfYear!,
                isoWeekYear: day.yearOfWeek!,
                dayOfYear: day.dayOfYear,
                daysInMonth: day.daysInMonth,
                leapYear: day.inLeapYear,
            };
        },
    });
}
