/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError, injectClock } from '@chamvi/core';
import type { ToolContext } from '@chamvi/core';
import type { ParsedDate } from './types.ts';
import { resolveZone } from './zone.ts';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET = /T.*(?:Z|[+-]\d{2}(?::?\d{2})?)(?:\[[^\]]*\])?$/i;

/**
 * `YYYY-MM-DD` (start of that day), `YYYY-MM-DDTHH:MM[:SS]` or an instant
 * with an offset or `Z`, read in `zone` (already resolved). A gap or overlap
 * resolves `compatible`. Anything else is a ValidationError naming `field`.
 */
export function parseDateInput(value: string, field: string, zone: string): ParsedDate {
    try {
        if (OFFSET.test(value)) {
            return {
                zoned: Temporal.Instant.from(value).toZonedDateTimeISO(zone),
                dateOnly: false,
                hasOffset: true,
            };
        }

        if (DATE_ONLY.test(value)) {
            return {
                zoned: Temporal.PlainDate.from(value).toZonedDateTime(zone),
                dateOnly: true,
                hasOffset: false,
            };
        }

        return {
            zoned: Temporal.PlainDateTime.from(value).toZonedDateTime(zone, { disambiguation: 'compatible' }),
            dateOnly: false,
            hasOffset: false,
        };
    } catch (error) {
        if (error instanceof RangeError || error instanceof TypeError) {
            throw new ValidationError(
                `${field} must be YYYY-MM-DD, YYYY-MM-DDTHH:MM or an instant with an offset or Z, and a real date; got "${value}".`,
            );
        }

        throw error;
    }
}

/** The call's `timezone` input checked, else `fallback`. */
export function zoneOf(body: Record<string, unknown>, fallback: string, field = 'timezone'): string {
    return body[field] === undefined ? fallback : resolveZone(String(body[field]), field);
}

/** An optional string input, else a ValidationError for any other type. */
export function optionalString(value: unknown, name: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${name} must be a non-empty string.`);
    }

    return value;
}

/** The engine clock's now, in `zone`. */
export function nowZoned(context: ToolContext, zone: string): Temporal.ZonedDateTime {
    return Temporal.Instant.fromEpochMilliseconds(injectClock(context).now().getTime()).toZonedDateTimeISO(zone);
}

/** The calendar date of an optional date input in `zone`, today when absent. */
export function dateOrToday(value: string | undefined, field: string, zone: string, context: ToolContext): Temporal.PlainDate {
    return (value === undefined ? nowZoned(context, zone) : parseDateInput(value, field, zone).zoned).toPlainDate();
}
