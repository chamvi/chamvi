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
import type { MailDeleteItem } from '../write-client/types.ts';
import { MAIL_DELETE_CLASSIFIER_INSTRUCTIONS } from './constants.ts';

type MailDeleteDecision = 'routine' | 'ask';

// an enum output: extract() keeps the run untainted
const DECISION_SCHEMA = jsonSchema<{ decision: MailDeleteDecision }>({
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
 * Whether moving `mails` is routine (newsletters, notifications, marketing, automated mail, spam) or needs the
 * owner's approval, decided by a tool-less model call on from, subject, folder and date only (never a body).
 * Any failure, unparsable output or a call past `timeoutMs` on `clock` is `ask`; an aborted run rethrows.
 */
export async function classifyMailDelete(
    ctx: ToolContext,
    mails: MailDeleteItem[],
    options: {
        model?: ModelRef;
        clock: IClock;
        timeoutMs: number
    },
): Promise<MailDeleteDecision> {
    const content = JSON.stringify(mails.map((mail) => ({
        from: mail.from,
        subject: mail.subject,
        folder: mail.folder,
        date: mail.date,
    })));
    const classified = extract(ctx, {
        schema: DECISION_SCHEMA,
        content,
        instructions: MAIL_DELETE_CLASSIFIER_INSTRUCTIONS,
        ...(options.model !== undefined && { model: options.model }),
    }).then(
        ({ decision }): MailDeleteDecision => (decision === 'routine' ? 'routine' : 'ask'),
        (error: unknown): MailDeleteDecision => {
            if (ctx.run.signal.aborted) {
                throw error;
            }

            return 'ask';
        },
    );

    let timer: ClockTimer | undefined;
    const timedOut = new Promise<MailDeleteDecision>((resolve) => {
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
