/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const TOOL_CALENDAR_MODULE_NAME = 'chamvi:tool-calendar';

/** A JSON array of `{ id?, url, address? }`, read by `toolCalendarModule()`. */
export const CALENDAR_ACCOUNTS_VARIABLE = 'CHAMVI_CALENDAR_ACCOUNTS';

/** The IANA zone event times are given in; wins over the module's `timezone` option. */
export const CALENDAR_TIMEZONE_VARIABLE = 'CHAMVI_CALENDAR_TIMEZONE';

/** The prefix of an account's credential variables: `CHAMVI_CALENDAR_<ID>_USER`, `..._PASSWORD`. */
export const CALENDAR_VARIABLE_PREFIX = 'CHAMVI_CALENDAR_';
