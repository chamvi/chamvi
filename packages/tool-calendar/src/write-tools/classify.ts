/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { jsonSchema } from 'ai';
import { extract } from '@chamvi/core';
import type {
    ClockTimer,
    IClock,
    ModelRef,
    ToolContext,
} from '@chamvi/core';
import { isObject } from 'smob';
import type { CalendarDeleteItem } from '../write-client/types.ts';
import { CALENDAR_DELETE_CLASSIFIER_INSTRUCTIONS } from './constants.ts';
import type { CalendarClassifierOptions } from './types.ts';

type CalendarDeleteDecision = 'routine' | 'ask';

// an enum output: extract() keeps the run untainted
const DECISION_SCHEMA = jsonSchema<{ decision: CalendarDeleteDecision }>({
    type: 'object',
    properties: { decision: { type: 'string', enum: ['routine', 'ask'] } },
    required: ['decision'],
    additionalProperties: false,
}, {
    validate: (value) => (isObject(value) && Object.keys(value).length === 1 && (value.decision === 'routine' || value.decision === 'ask') ?
        { success: true, value: { decision: value.decision } } :
        { success: false, error: new Error('Not a delete decision.') }),
});

/**
 * Whether deleting `item` is routine, decided by a tool-less model call on
 * title, start, end, allDay and the attendee count only (never the
 * description, location or organizer). Any failure, unparsable output or a
 * call past `timeoutMs` on `clock` is `ask`; an aborted run rethrows.
 */
export async function classifyCalendarDelete(
    ctx: ToolContext,
    item: CalendarDeleteItem,
    options: {
        model?: ModelRef; 
        clock: IClock; 
        timeoutMs: number 
    },
): Promise<CalendarDeleteDecision> {
    const content = JSON.stringify({
        title: item.title,
        start: item.start,
        end: item.end,
        allDay: item.allDay,
        attendees: item.attendees,
    });
    const classified = extract(ctx, {
        schema: DECISION_SCHEMA,
        content,
        instructions: CALENDAR_DELETE_CLASSIFIER_INSTRUCTIONS,
        ...(options.model !== undefined && { model: options.model }),
    }).then(
        ({ decision }): CalendarDeleteDecision => (decision === 'routine' ? 'routine' : 'ask'),
        (error: unknown): CalendarDeleteDecision => {
            if (ctx.run.signal.aborted) {
                throw error;
            }

            return 'ask';
        },
    );

    let timer: ClockTimer | undefined;
    const timedOut = new Promise<CalendarDeleteDecision>((resolve) => {
        timer = options.clock.setTimeout(() => resolve('ask'), options.timeoutMs);
    });

    try {
        return await Promise.race([classified, timedOut]);
    } finally {
        timer?.clear();
        // a call past the timeout settles later (the run's abort ends it): nothing waits for it
        classified.catch(() => undefined);
    }
}

/**
 * The verdict on a delete: `ask` without a model call when the resource
 * repeats, has someone besides the owner (an attendee or organizer the server
 * may notify) or has not ended; else the classifier's.
 */
export async function deleteVerdictOf(
    ctx: ToolContext,
    item: CalendarDeleteItem,
    options: CalendarClassifierOptions,
): Promise<CalendarDeleteDecision> {
    if (item.recurring || item.others || !item.ended) {
        return 'ask';
    }

    return classifyCalendarDelete(ctx, item, options);
}
