/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import { WEEKDAYS } from './constants.ts';
import type { ZonedDescription } from './types.ts';

/** The zone id checked and canonicalized, else a ValidationError naming `field`. */
export function resolveZone(value: string, field: string): string {
    let id: string | undefined;

    try {
        id = new Temporal.ZonedDateTime(0n, value).timeZoneId;
    } catch {
        id = undefined;
    }

    // A fixed offset is a valid Temporal zone but has no daylight saving rules
    if (id === undefined || /^[+-]/.test(id)) {
        throw new ValidationError(`${field} must be an IANA time zone id (e.g. Europe/Berlin) or UTC; got "${value}".`);
    }

    return id;
}

/** An instant read in `zone` (already resolved): date, weekday, time, offset and the zoned ISO string. */
export function describeInstant(instant: Temporal.Instant, zone: string): ZonedDescription {
    const zoned = instant.toZonedDateTimeISO(zone);

    return {
        date: zoned.toPlainDate().toString(),
        weekday: WEEKDAYS[zoned.dayOfWeek - 1]!,
        time: `${String(zoned.hour).padStart(2, '0')}:${String(zoned.minute).padStart(2, '0')}`,
        timezone: zoned.timeZoneId,
        offset: zoned.offset,
        iso: zoned.toString({ timeZoneName: 'never', smallestUnit: 'second' }),
    };
}
