/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { ValidationError, defineTool } from '@chamvi/core';
import { inputObject, objectSchema, requireString } from './asserts.ts';
import { parseDateInput, zoneOf } from './dates.ts';
import { describeInstant, resolveZone } from './zone.ts';
import type { UtilityToolsOptionsNormalized } from '../options/types.ts';
import type { TimeConvertResult } from './types.ts';

type TimeConvertInput = {
    dateTime: string;
    from?: string;
    to: string;
};

export function timeConvertTool(options: UtilityToolsOptionsNormalized): Tool<TimeConvertInput, TimeConvertResult> {
    return defineTool<TimeConvertInput, TimeConvertResult>({
        description: 'Convert a wall-clock time from one IANA time zone to another, for "what is 15:00 New York time in Berlin". ' +
            `from is the zone dateTime is read in (default ${options.timezone}); an instant with an offset or Z carries its own and must not be combined with from. ` +
            'A time that does not exist or repeats on a daylight saving change resolves to the later valid time.',
        inputSchema: objectSchema<TimeConvertInput>({
            dateTime: { type: 'string', description: 'YYYY-MM-DDTHH:MM[:SS], YYYY-MM-DD or an instant with an offset or Z.' },
            from: { type: 'string', description: `The IANA zone dateTime is in. Default ${options.timezone}.` },
            to: { type: 'string', description: 'The IANA zone to convert to, e.g. Asia/Tokyo.' },
        }, ['dateTime', 'to']),
        execute: async (input) => {
            const body = inputObject(input);
            const value = requireString(body.dateTime, 'dateTime');
            const to = resolveZone(requireString(body.to, 'to'), 'to');
            const from = zoneOf(body, options.timezone, 'from');
            const parsed = parseDateInput(value, 'dateTime', from);

            if (parsed.hasOffset && body.from !== undefined) {
                throw new ValidationError('dateTime has an offset or Z, so from is ambiguous; drop one of them.');
            }

            const instant = parsed.zoned.toInstant();

            return {
                from: describeInstant(instant, from),
                to: describeInstant(instant, to),
            };
        },
    });
}
