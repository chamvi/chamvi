/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { CalendarAccount } from '../client/types.ts';
import { CALENDAR_ADDRESS_PATTERN } from './constants.ts';

/** A bare address of printable ASCII in the shape `CALENDAR_ADDRESS_PATTERN` accepts. */
export function isCalendarAddress(value: unknown): value is string {
    return typeof value === 'string' && /^[\x21-\x7E]+$/.test(value) && CALENDAR_ADDRESS_PATTERN.test(value);
}

/**
 * The organizer address of an account: the first `mailto:` of its calendar
 * user addresses that is a bare address, else `user` when it is one.
 */
export function organizerOf(addresses: string[], user: string): string | undefined {
    for (const address of addresses) {
        if (/^mailto:/i.test(address)) {
            const bare = address.slice('mailto:'.length);

            if (isCalendarAddress(bare)) {
                return bare;
            }
        }
    }

    return isCalendarAddress(user) ? user : undefined;
}

/** The `Authorization` header value of `account` (Basic). */
export function basicAuthorizationOf(account: CalendarAccount): string {
    return `Basic ${Buffer.from(`${account.user}:${account.password}`, 'utf8').toString('base64')}`;
}

/** The account of the calendar id `calendar` (its part before the first `:`); '' without one. */
export function calendarAccountOf(calendar: string): string {
    return calendar.includes(':') ? calendar.slice(0, calendar.indexOf(':')) : '';
}
