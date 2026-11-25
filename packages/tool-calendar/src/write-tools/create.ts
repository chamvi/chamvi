/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Tool } from 'ai';
import {
    ToolDeniedError,
    ValidationError,
    defineEffectTool,
    toolLimitApproved,
} from '@chamvi/core';
import type { ApprovalDecision, ApprovalRequestInput, ToolContext } from '@chamvi/core';
import { isObject } from 'smob';
import { CALENDAR_DESCRIPTION_MAX_CHARS, CALENDAR_FIELD_MAX_CHARS } from '../expand/constants.ts';
import { objectSchema, signalOf } from '../tools/asserts.ts';
import { calendarResourceOf } from '../write-client/create.ts';
import type { CalendarCreateResult } from '../write-client/types.ts';
import { askCalendarApproval, createApprovalOf } from './approval.ts';
import { notWritableError, parseCalendarCreateInput } from './asserts.ts';
import { CALENDAR_CREATE_MAX_ATTENDEES, CALENDAR_CREATE_MAX_DAYS } from './constants.ts';
import { calendarCreateKey } from './keys.ts';
import { calendarCreateLimitOf, createLimitShown } from './limit.ts';
import type { CalendarCreateInput, CalendarCreateToolOptions, CalendarWriteClientSource } from './types.ts';

/** The owner's decision; a request the source chat cannot show is the model's to shorten. */
async function decisionOf(ctx: ToolContext, request: ApprovalRequestInput): Promise<ApprovalDecision> {
    try {
        return await askCalendarApproval(ctx, request);
    } catch (error) {
        if (error instanceof ValidationError) {
            throw new ValidationError(`${error.message} The approval does not fit this chat: shorten the description or ` +
                'invite fewer people and call calendar_create again; nothing was created.');
        }

        throw error;
    }
}

export function calendarCreateTool(
    source: CalendarWriteClientSource,
    options: CalendarCreateToolOptions,
): Tool<CalendarCreateInput, CalendarCreateResult> {
    return defineEffectTool<CalendarCreateInput, CalendarCreateResult>({
        // it asks the owner itself before any invitation, with the whole event
        trust: { guardWhenTainted: false },
        description: 'Create one event in a calendar of calendar_list. Times without an offset are in the configured ' +
            'zone; with allDay: true start and end are dates and end is exclusive (a one-day event ends the next ' +
            'day). Without attendees the event is created right away. With attendees the owner always approves the ' +
            'exact invitation first (calendar, title, time, place, every attendee and the whole description), and the ' +
            'server sends the invitations when it implements CalDAV scheduling; a denial is final for this event. ' +
            'Addresses are bare (alice@example.com). When the approval is too long for the chat, shorten the ' +
            'description or invite fewer people and call calendar_create again. Creates are rate limited; over the ' +
            'limit the owner is asked instead. The result gives the event id for calendar_delete.',
        inputSchema: objectSchema<CalendarCreateInput>({
            calendar: {
                type: 'string',
                minLength: 1,
                description: 'A calendar id from calendar_list.',
            },
            title: {
                type: 'string',
                minLength: 1,
                maxLength: CALENDAR_FIELD_MAX_CHARS,
                description: 'One line.',
            },
            start: {
                type: 'string',
                minLength: 1,
                description: 'An ISO date-time (2026-11-05T09:00, in the configured zone, or with an offset); with allDay a date (2026-11-05).',
            },
            end: {
                type: 'string',
                minLength: 1,
                description: `As start, exclusive; after start and at most ${CALENDAR_CREATE_MAX_DAYS} days later.`,
            },
            allDay: {
                type: 'boolean',
                description: 'A whole-day event: start and end are dates. Default false.',
            },
            location: {
                type: 'string',
                minLength: 1,
                maxLength: CALENDAR_FIELD_MAX_CHARS,
                description: 'One line.',
            },
            description: {
                type: 'string',
                minLength: 1,
                maxLength: CALENDAR_DESCRIPTION_MAX_CHARS,
                description: 'Plain text; newlines allowed.',
            },
            attendees: {
                type: 'array',
                items: { type: 'string', minLength: 3 },
                minItems: 1,
                maxItems: CALENDAR_CREATE_MAX_ATTENDEES,
                description: `1 to ${CALENDAR_CREATE_MAX_ATTENDEES} bare addresses to invite; leave it out to invite nobody.`,
            },
        }, ['calendar', 'title', 'start', 'end']),
        effectKey: (input, ctx) => calendarCreateKey(input, ctx),
        ...(options.limit !== false && { limit: calendarCreateLimitOf(source, options.writable, options.limit) }),
        // a create whose record never landed: its resource, named after the key (fail closed: a failed lookup throws)
        alreadyApplied: async (key, input, ctx) => {
            const calendar = isObject(input) && typeof input.calendar === 'string' ? input.calendar : undefined;
            const client = source(ctx);

            // execute refuses these (no request for a calendar the tools may not write to); the unconfigured
            // client's lookup refuses with its connection error
            if ((calendar === undefined || !options.writable(calendar)) && client.configured !== false) {
                return undefined;
            }

            return client.findCreated(calendar ?? '', key, ctx.run.signal);
        },
        execute: async (input, { abortSignal, context }) => {
            const client = source(context);
            const parsed = parseCalendarCreateInput(input, client.timezone);

            if (!options.writable(parsed.calendar)) {
                throw notWritableError('calendar_create', parsed.calendar);
            }

            const signal = signalOf(abortSignal, context);
            const view = await client.calendar(parsed.calendar, signal);
            let organizer: string | undefined;

            if (parsed.attendees.length > 0) {
                organizer = await client.organizer(view.account, signal);

                if (organizer === undefined) {
                    throw new ValidationError(`calendar_create: account "${view.account}" has no calendar address to invite from.`);
                }

                // an approved limit approval that showed the whole create is the owner's decision on it; an agent's
                // own limit shows nothing, so the invitation is still asked
                if (!toolLimitApproved(context) || !await createLimitShown(context)) {
                    const decision = await decisionOf(context, createApprovalOf(view, parsed, client.timezone, organizer));

                    if (!decision.approved) {
                        const reason = decision.reason ? ` Reason: ${decision.reason}` : '';

                        throw new ToolDeniedError(`calendar_create: not approved; nothing was created.${reason}`);
                    }
                }
            }

            const { uid, name } = calendarResourceOf(calendarCreateKey(input, context));

            return client.create({
                calendar: parsed.calendar,
                uid,
                name,
                title: parsed.title,
                start: parsed.start,
                end: parsed.end,
                ...(parsed.location !== undefined && { location: parsed.location }),
                ...(parsed.description !== undefined && { description: parsed.description }),
                ...(organizer !== undefined && { organizer }),
                attendees: parsed.attendees,
            }, signal);
        },
    });
}
