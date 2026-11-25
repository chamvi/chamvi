/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ConnectionNotConfiguredError, systemClock } from '@chamvi/core';
import { CALENDAR_DEFAULT_TIMEZONE } from '../options/constants.ts';
import type { ICalendarWriteClient } from './types.ts';

/** The write client of an app without accounts: each call is a tool error naming the connection. */
export function createUnconfiguredCalendarWriteClient(connection: string, timezone: string = CALENDAR_DEFAULT_TIMEZONE): ICalendarWriteClient {
    const refuse = async (): Promise<never> => {
        throw new ConnectionNotConfiguredError(connection);
    };

    return {
        // nothing is ever written or read
        configured: false,
        timezone,
        clock: systemClock,
        calendar: refuse,
        organizer: refuse,
        close: async () => undefined,
    };
}
