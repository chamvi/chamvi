/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { ValidationError, defineTool } from '@chamvi/core';
import { inputObject, objectSchema, optionalInteger } from './asserts.ts';
import { 
    nowZoned, 
    optionalString, 
    parseDateInput, 
    zoneOf, 
} from './dates.ts';
import type { UtilityToolsOptionsNormalized } from '../options/types.ts';
import type { ZonedDescription } from './types.ts';
import { describeInstant } from './zone.ts';

const UNITS = ['years', 'months', 'weeks', 'days', 'hours', 'minutes'] as const;

type DateAddInput = {
    date?: string;
    timezone?: string;
} & { [unit in typeof UNITS[number]]?: number };

const AMOUNT = { type: 'integer', description: 'A signed whole number; negative subtracts.' } as const;

export function dateAddTool(options: UtilityToolsOptionsNormalized): Tool<DateAddInput, ZonedDescription> {
    return defineTool<DateAddInput, ZonedDescription>({
        description: 'Add or subtract years, months, weeks, days, hours or minutes to a date or date-time. ' +
            'Call it instead of counting yourself, for example "in 3 weeks" or "2 hours before". ' +
            'Years, months, weeks and days keep the wall-clock time across daylight saving changes (Jan 31 plus a month is Feb 28); ' +
            'hours and minutes add exact time. A date without a time starts at 00:00. ' +
            `Without date it starts from now. Read in the given IANA timezone, else ${options.timezone}.`,
        inputSchema: objectSchema<DateAddInput>({
            date: {
                type: 'string',
                description: 'YYYY-MM-DD, YYYY-MM-DDTHH:MM or an instant with an offset or Z. Default now.',
            },
            years: AMOUNT,
            months: AMOUNT,
            weeks: AMOUNT,
            days: AMOUNT,
            hours: AMOUNT,
            minutes: AMOUNT,
            timezone: { type: 'string', description: `An IANA time zone id. Default ${options.timezone}.` },
        }),
        execute: async (input, { context }) => {
            const body = inputObject(input ?? {});
            const zone = zoneOf(body, options.timezone);
            const date = optionalString(body.date, 'date');
            const start = date === undefined ?
                nowZoned(context, zone) :
                parseDateInput(date, 'date', zone).zoned;
            const amounts: Partial<Record<typeof UNITS[number], number>> = {};

            for (const unit of UNITS) {
                const amount = optionalInteger(body[unit], unit, -Number.MAX_SAFE_INTEGER);

                if (amount !== undefined) {
                    amounts[unit] = amount;
                }
            }

            try {
                const {
                    hours, 
                    minutes, 
                    ...calendar 
                } = amounts;
                let result = start;

                if (Object.keys(calendar).length > 0) {
                    result = result.add(calendar);
                }

                if (hours !== undefined || minutes !== undefined) {
                    result = result.add({ hours, minutes });
                }

                return describeInstant(result.toInstant(), zone);
            } catch (error) {
                if (error instanceof RangeError) {
                    throw new ValidationError(
                        `The amount (${JSON.stringify(amounts)}) puts the result outside the supported date range.`,
                    );
                }

                throw error;
            }
        },
    });
}
