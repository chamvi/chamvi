/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { CALENDAR_CHANGED_MESSAGE } from './constants.ts';
import { calendarDeleteTargetOf } from './describe.ts';
import {
    discardBody,
    resourceRequest,
    resourceUrlOf,
    statusError,
} from './resource.ts';
import type { CalendarWriteSessions } from './session.ts';

const TOOL = 'calendar_delete';

/**
 * DELETEs the resource the id `event` names with `If-Match` of the id's ETag:
 * `200`/`204` deleted, `404` missing, `412` the event changed
 * (`CALENDAR_CHANGED_MESSAGE`), `401`/`403` not permitted, else request failed.
 */
export async function removeCalendarEvent(
    sessions: CalendarWriteSessions,
    event: string,
    signal: AbortSignal | undefined,
): Promise<'deleted' | 'missing'> {
    const ref = calendarDeleteTargetOf(sessions, event);
    const account = sessions.account(ref.account);

    return sessions.run(TOOL, ref.account, signal, async (inner) => {
        const entry = await sessions.calendar(ref.account, ref.calendar, inner);
        const response = await resourceRequest(sessions.fetch, account, {
            method: 'DELETE',
            url: resourceUrlOf(entry.view, ref.name),
            headers: { 'If-Match': ref.etag },
            signal: inner,
        });

        await discardBody(response);

        if (response.status === 200 || response.status === 204) {
            return 'deleted';
        }

        if (response.status === 404) {
            return 'missing';
        }

        if (response.status === 412) {
            throw new ValidationError(CALENDAR_CHANGED_MESSAGE);
        }

        throw statusError(TOOL, ref.account, response.status);
    });
}
