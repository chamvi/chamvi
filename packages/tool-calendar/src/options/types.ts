/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { CalendarAccount, ICalendarClient } from '../client/types.ts';

export type CalendarClientOptions = {
    /** The fetch the CalDAV requests go through (default the global one); only PROPFIND, REPORT and GET pass. */
    fetch?: typeof fetch;
    clock?: IClock;
    /** Milliseconds one call may take per account (default `CALENDAR_TIMEOUT_MS`, 30 s). */
    timeoutMs?: number;
    /** The IANA zone event times are given in (default `CALENDAR_DEFAULT_TIMEZONE`, Europe/Berlin). */
    timezone?: string;
};

export type CalendarToolsOptions = CalendarClientOptions & {
    /** The accounts the tools read; without them (and `client`) the tools use the client the module provided. */
    accounts?: CalendarAccount[];
    /** A client to use instead of one built from `accounts`. */
    client?: ICalendarClient;
};

/** The client options checked, with their defaults. */
export type CalendarClientOptionsNormalized = {
    fetch: typeof fetch;
    clock: IClock;
    timeoutMs: number;
    timezone: string;
};
