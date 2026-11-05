/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError, ValidationError } from '@chamvi/core';
import { CALENDAR_REQUEST_ERROR_CODE } from '../errors/constants.ts';
import { CALENDAR_EVENTS_DEFAULT_LIMIT, CALENDAR_EVENTS_MAX_LIMIT, CALENDAR_RANGE_MAX_DAYS } from './constants.ts';

/** A failed request as a tool error (code `calendar_request`); `message` is generic, never server text. */
export function calendarError(message: string): ChamviError {
    return new ChamviError({ message, code: CALENDAR_REQUEST_ERROR_CODE });
}

/** An ISO date (midnight in `zone`) or date-time (with an offset, else in `zone`) as an instant. */
export function parseInstant(value: unknown, name: string, zone: string): Temporal.Instant {
    if (typeof value === 'string') {
        try {
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                return Temporal.PlainDate.from(value).toZonedDateTime(zone).toInstant();
            }

            if (/(?:Z|[+-]\d{2}(?::?\d{2})?)(?:\[.*\])?$/i.test(value)) {
                return Temporal.Instant.from(value);
            }

            return Temporal.PlainDateTime.from(value).toZonedDateTime(zone).toInstant();
        } catch {
            // reported below
        }
    }

    throw new ValidationError(`${name} must be an ISO date (2026-11-05) or date-time (2026-11-05T09:00:00+01:00).`);
}

/** `from` and `to` as instants: `to` after `from`, at most CALENDAR_RANGE_MAX_DAYS apart (ValidationError). */
export function parseRange(from: unknown, to: unknown, zone: string): { from: Temporal.Instant; to: Temporal.Instant } {
    const start = parseInstant(from, 'from', zone);
    const end = parseInstant(to, 'to', zone);

    if (Temporal.Instant.compare(end, start) <= 0) {
        throw new ValidationError('to must be after from.');
    }

    if (end.epochMilliseconds - start.epochMilliseconds > CALENDAR_RANGE_MAX_DAYS * 86_400_000) {
        throw new ValidationError(`from and to must be at most ${CALENDAR_RANGE_MAX_DAYS} days apart.`);
    }

    return { from: start, to: end };
}

/** The events limit with its default (ValidationError). */
export function parseLimit(value: unknown): number {
    if (value === undefined) {
        return CALENDAR_EVENTS_DEFAULT_LIMIT;
    }

    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > CALENDAR_EVENTS_MAX_LIMIT) {
        throw new ValidationError(`limit must be an integer from 1 to ${CALENDAR_EVENTS_MAX_LIMIT}.`);
    }

    return value;
}
