/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { defineTool, injectClock } from '@chamvi/core';
import { inputObject, objectSchema } from './asserts.ts';
import type { UtilityToolsOptionsNormalized } from '../options/types.ts';
import type { CurrentTimeResult } from './types.ts';
import { describeInstant, resolveZone } from './zone.ts';

type CurrentTimeInput = {
    timezone?: string;
};

export function currentTimeTool(options: UtilityToolsOptionsNormalized): Tool<CurrentTimeInput, CurrentTimeResult> {
    return defineTool<CurrentTimeInput, CurrentTimeResult>({
        description: 'The current date, weekday and time. Call it before working with "today", "yesterday", ' +
            '"this week" or any relative date: you have no clock of your own. ' +
            `Read in the given IANA timezone, else ${options.timezone}. startTime is when this run began.`,
        inputSchema: objectSchema<CurrentTimeInput>({
            timezone: {
                type: 'string',
                description: `An IANA time zone id such as Europe/Berlin. Default ${options.timezone}.`,
            },
        }),
        execute: async (input, { context }) => {
            const body = inputObject(input ?? {});
            const zone = typeof body.timezone === 'string' ?
                resolveZone(body.timezone, 'timezone') :
                options.timezone;
            const now = Temporal.Instant.fromEpochMilliseconds(injectClock(context).now().getTime());
            // a stored run may hold receivedAt serialized
            const started = Temporal.Instant.fromEpochMilliseconds(new Date(context.run.trigger.receivedAt).getTime());

            return {
                ...describeInstant(now, zone),
                startTime: describeInstant(started, zone).iso,
            };
        },
    });
}
