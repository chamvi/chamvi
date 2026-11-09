/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { defineTool } from '@chamvi/core';
import { inputObject, objectSchema, requireString } from './asserts.ts';
import { 
    dateOrToday, 
    optionalString, 
    parseDateInput, 
    zoneOf, 
} from './dates.ts';
import type { UtilityToolsOptionsNormalized } from '../options/types.ts';
import type { DateDiffResult } from './types.ts';

type DateDiffInput = {
    from: string;
    to?: string;
    timezone?: string;
};

export function dateDiffTool(options: UtilityToolsOptionsNormalized): Tool<DateDiffInput, DateDiffResult> {
    return defineTool<DateDiffInput, DateDiffResult>({
        description: 'The signed distance between two calendar dates in whole days, weeks, months and years ' +
            '(each a separate total, truncated toward zero; negative when to is before from). ' +
            'Call it for "how many days until ..." or "how long since ...". ' +
            `Dates are compared in the given IANA timezone, else ${options.timezone}; without to it is today.`,
        inputSchema: objectSchema<DateDiffInput>({
            from: { type: 'string', description: 'YYYY-MM-DD, YYYY-MM-DDTHH:MM or an instant with an offset or Z.' },
            to: { type: 'string', description: 'Same formats. Default today.' },
            timezone: { type: 'string', description: `An IANA time zone id. Default ${options.timezone}.` },
        }, ['from']),
        execute: async (input, { context }) => {
            const body = inputObject(input);
            const zone = zoneOf(body, options.timezone);
            const from = parseDateInput(requireString(body.from, 'from'), 'from', zone).zoned.toPlainDate();
            const to = dateOrToday(optionalString(body.to, 'to'), 'to', zone, context);
            const total = (largestUnit: 'days' | 'weeks' | 'months' | 'years') => 
                // `|| 0` turns -0 into 0
                from.until(to, { largestUnit })[largestUnit] || 0
            ;

            return {
                days: total('days'),
                weeks: total('weeks'),
                months: total('months'),
                years: total('years'),
            };
        },
    });
}
