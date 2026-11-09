/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { ValidationError, defineTool } from '@chamvi/core';
import {
    inputObject,
    objectSchema,
    optionalOneOf,
    requireString,
} from './asserts.ts';
import { WEEKDAYS } from './constants.ts';
import { dateOrToday, optionalString, zoneOf } from './dates.ts';
import type { UtilityToolsOptionsNormalized } from '../options/types.ts';
import type { NextWeekdayResult } from './types.ts';

type NextWeekdayInput = {
    weekday: string;
    date?: string;
    timezone?: string;
    includeToday?: boolean;
};

const NAMES = WEEKDAYS.map((name) => name.toLowerCase());

export function nextWeekdayTool(options: UtilityToolsOptionsNormalized): Tool<NextWeekdayInput, NextWeekdayResult> {
    return defineTool<NextWeekdayInput, NextWeekdayResult>({
        description: 'The next date that falls on a weekday, for "next Friday" or "on Monday". ' +
            'The same weekday as the start date gives the one a week later unless includeToday is true. ' +
            `Without date it starts from today in the given IANA timezone, else ${options.timezone}.`,
        inputSchema: objectSchema<NextWeekdayInput>({
            weekday: {
                type: 'string',
                enum: NAMES,
                description: 'English weekday name, e.g. friday.',
            },
            date: { type: 'string', description: 'YYYY-MM-DD, YYYY-MM-DDTHH:MM or an instant with an offset or Z. Default today.' },
            timezone: { type: 'string', description: `An IANA time zone id. Default ${options.timezone}.` },
            includeToday: { type: 'boolean', description: 'Count the start date itself. Default false.' },
        }, ['weekday']),
        execute: async (input, { context }) => {
            const body = inputObject(input);
            const name = requireString(body.weekday, 'weekday').toLowerCase();
            const weekday = optionalOneOf(name, 'weekday', NAMES)!;

            if (body.includeToday !== undefined && typeof body.includeToday !== 'boolean') {
                throw new ValidationError('includeToday must be a boolean.');
            }

            const zone = zoneOf(body, options.timezone);
            const start = dateOrToday(optionalString(body.date, 'date'), 'date', zone, context);
            let daysAway = (NAMES.indexOf(weekday) + 1 - start.dayOfWeek + 7) % 7;

            if (daysAway === 0 && body.includeToday !== true) {
                daysAway = 7;
            }

            const date = start.add({ days: daysAway });

            return {
                date: date.toString(),
                weekday: WEEKDAYS[date.dayOfWeek - 1]!,
                daysAway,
            };
        },
    });
}
