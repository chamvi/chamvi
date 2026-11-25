/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import { jsonSchema } from 'ai';
import {
    ToolDeniedError,
    ValidationError,
    defineEffectTool,
    once,
    toolLimitApproved,
} from '@chamvi/core';
import type { ApprovalDecision, ApprovalRequestInput, ToolContext } from '@chamvi/core';
import { createHash } from 'node:crypto';
import { isObject } from 'smob';
import { parseCalendarEventId } from '../event-id/module.ts';
import { signalOf } from '../tools/asserts.ts';
import { CALENDAR_CHANGED_MESSAGE } from '../write-client/constants.ts';
import { askCalendarApproval, deleteApprovalOf } from './approval.ts';
import { notWritableError } from './asserts.ts';
import { deleteVerdictOf } from './classify.ts';
import { CALENDAR_DELETE_BACKUP_ONCE, CALENDAR_DELETE_CLASSIFY_ONCE, CALENDAR_SERIES_MESSAGE } from './constants.ts';
import { calendarDeleteKey } from './keys.ts';
import { calendarDeleteLimitOf, limitListingCovers } from './limit.ts';
import type {
    CalendarDeleteInput,
    CalendarDeleteResult,
    CalendarDeleteToolOptions,
    CalendarWriteClientSource,
} from './types.ts';

/** A `calendar_delete` input checked (ValidationError): `event` a non-empty string, `series` a boolean, no other key. */
function parseCalendarDeleteInput(value: unknown): CalendarDeleteInput {
    const extra = isObject(value) && Object.keys(value).some((key) => key !== 'event' && key !== 'series');

    if (
        !isObject(value) ||
        typeof value.event !== 'string' ||
        value.event.length === 0 ||
        (value.series !== undefined && typeof value.series !== 'boolean') ||
        extra
    ) {
        throw new ValidationError('calendar_delete: the input must be { event, series? }: event an id from calendar_events, series true or false.');
    }

    return { event: value.event, ...(value.series !== undefined && { series: value.series as boolean }) };
}

const INPUT_SCHEMA = jsonSchema<CalendarDeleteInput>({
    type: 'object',
    properties: {
        event: {
            type: 'string',
            minLength: 1,
            description: 'The id of the event, from calendar_events (or calendar_create).',
        },
        series: {
            type: 'boolean',
            description: 'Required as true for a repeating event: deletes every occurrence of the series.',
        },
    },
    required: ['event'],
    additionalProperties: false,
}, {
    validate: (value) => {
        try {
            return { success: true, value: parseCalendarDeleteInput(value) };
        } catch (error) {
            return { success: false, error: error as Error };
        }
    },
});

function sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/** The owner's decision; a request the source chat cannot show fails the call. */
async function decisionOf(ctx: ToolContext, request: ApprovalRequestInput): Promise<ApprovalDecision> {
    try {
        return await askCalendarApproval(ctx, request);
    } catch (error) {
        if (error instanceof ValidationError) {
            throw new ValidationError(`${error.message} The approval does not fit this chat; nothing was deleted.`);
        }

        throw error;
    }
}

export function calendarDeleteTool(
    source: CalendarWriteClientSource,
    options: CalendarDeleteToolOptions,
): Tool<CalendarDeleteInput, CalendarDeleteResult> {
    return defineEffectTool<CalendarDeleteInput, CalendarDeleteResult>({
        // it asks the owner itself whenever a delete is not routine; the result carries ids only
        trust: { guardWhenTainted: false },
        description: 'Delete one event by its id from calendar_events. A repeating event is deleted as a whole series ' +
            'or not at all, and needs series: true. The event\'s iCalendar is saved as a run artifact (backup) first. ' +
            'Only the owner\'s own past events without other people may be deleted right away when they look routine; ' +
            'anything else asks the owner first, and a denial is final for this call. When the event changed since ' +
            'calendar_events read it, read it again and use its new id. Deletes are rate limited; over the limit the ' +
            'owner is asked instead. status missing: the event was gone already.',
        inputSchema: INPUT_SCHEMA,
        effectKey: (input, ctx) => calendarDeleteKey(input, ctx),
        ...(options.limit !== false && { limit: calendarDeleteLimitOf(source, options.writable, options.limit) }),
        execute: async (input, { abortSignal, context }) => {
            const { event, series } = parseCalendarDeleteInput(input);
            const ref = parseCalendarEventId(event);

            if (!options.writable(ref.calendar)) {
                throw notWritableError('calendar_delete', ref.calendar);
            }

            const client = source(context);
            const signal = signalOf(abortSignal, context);
            const item = await client.describe(event, signal);

            if (!item) {
                // gone: deleted by this call before a crash (its backup is recorded), else by someone else
                const backup = await once<string | null>(context, CALENDAR_DELETE_BACKUP_ONCE, async () => null);

                return backup ?
                    {
                        event, 
                        calendar: ref.calendar, 
                        status: 'deleted', 
                        backup, 
                    } :
                    {
                        event, 
                        calendar: ref.calendar, 
                        status: 'missing', 
                    };
            }

            if (item.etag !== ref.etag) {
                throw new ValidationError(CALENDAR_CHANGED_MESSAGE);
            }

            if (item.recurring && series !== true) {
                throw new ValidationError(CALENDAR_SERIES_MESSAGE);
            }

            // an approved limit approval that listed this event is the owner's decision on the call; one that
            // showed less (a fallback, an agent's own limit) is not, and the checks below still run
            if (!toolLimitApproved(context) || !await limitListingCovers(context, event)) {
                // recorded: a resumed call reaches the answer of the approval it asked, whatever a new verdict says
                const verdict = await once(context, CALENDAR_DELETE_CLASSIFY_ONCE, () => deleteVerdictOf(context, item, {
                    clock: options.clock,
                    timeoutMs: options.timeoutMs,
                    ...(options.model !== undefined && { model: options.model }),
                }));

                if (verdict === 'ask') {
                    const decision = await decisionOf(context, deleteApprovalOf(item, client.timezone));

                    if (!decision.approved) {
                        const reason = decision.reason ? ` Reason: ${decision.reason}` : '';

                        throw new ToolDeniedError(`calendar_delete: not approved; nothing was deleted.${reason}`);
                    }
                }
            }

            const key = calendarDeleteKey(input, context);
            const backup = await once<string | null>(context, CALENDAR_DELETE_BACKUP_ONCE, () => context.artifacts.put({
                key: `calendar_delete:${sha256Hex(key).slice(0, 32)}`,
                mediaType: 'text/calendar',
                filename: item.name,
                data: item.data,
            }).then((artifact) => artifact.id));
            const status = await client.remove(event, signal);

            return {
                event,
                calendar: item.calendar,
                status,
                ...(backup && { backup }),
            };
        },
    });
}
