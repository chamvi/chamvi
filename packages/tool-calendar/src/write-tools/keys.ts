/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { isObject } from 'smob';

/** The SHA-256 of `value` as hex: the one hash of the write keys, UIDs, resource names and backup keys. */
export function sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/** The distinct attendees of an input, lower-cased, in input order; none for a malformed one (the tool refuses it). */
function attendeesOf(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase()))];
}

/**
 * The effect key of a create: the run and the whole event as given (the
 * attendees deduplicated and lower-cased), so a replay of the same call (and
 * only that) finds its record or its resource.
 */
export function calendarCreateKey(input: unknown, ctx: { run: { runId: string } }): string {
    const body = isObject(input) ? input : {};
    const event = [
        body.calendar,
        body.title,
        body.start,
        body.end,
        body.allDay ?? false,
        body.location ?? null,
        body.description ?? null,
        attendeesOf(body.attendees),
    ];

    return `${ctx.run.runId}:calendar_create:${sha256Hex(JSON.stringify(event))}`;
}

/** The effect key of a delete: the run and the event id. */
export function calendarDeleteKey(input: unknown, ctx: { run: { runId: string } }): string {
    const event = isObject(input) && typeof input.event === 'string' ? input.event : '';

    return `${ctx.run.runId}:calendar_delete:${sha256Hex(event)}`;
}
