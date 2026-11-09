/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Env } from '@chamvi/app';
import type { CalendarAccount } from '../client/types.ts';

export type ToolCalendarModuleOptions = {
    /** Where the `CHAMVI_CALENDAR_*` variables are read, when the factory is called; default `process.env`. */
    env?: Env;
    /** The accounts to read; given, `CHAMVI_CALENDAR_ACCOUNTS` is not read. */
    accounts?: CalendarAccount[];
    /** The zone event times are given in (default Europe/Berlin); `CHAMVI_CALENDAR_TIMEZONE` wins over it. */
    timezone?: string;
    /** The fetch the CalDAV requests go through (default the global one); only PROPFIND, REPORT and GET pass. */
    fetch?: typeof fetch;
};

/** One entry of `CHAMVI_CALENDAR_ACCOUNTS`: the account and the address the variable named. */
export type CalendarEnvEntry = {
    account: CalendarAccount;
    address?: string;
};
