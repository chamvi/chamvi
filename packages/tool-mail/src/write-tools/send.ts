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
    effectMarker,
} from '@chamvi/core';
import type { ApprovalDecision, ToolContext } from '@chamvi/core';
import { objectSchema, signalOf } from '../tools/asserts/index.ts';
import type { MailSendResult } from '../write-client/types.ts';
import { askMailApproval, sendApprovalOf } from './approval.ts';
import { parseMailSendInput } from './asserts.ts';
import { MAIL_SEND_MAX_RECIPIENTS, MAIL_SEND_SUBJECT_MAX_CHARS, MAIL_SEND_TEXT_MAX_CHARS } from './constants.ts';
import { mailMessageIdOf, mailSendKey } from './keys.ts';
import type { MailSendInput, MailWriteClientSource } from './types.ts';

const ADDRESSES = {
    type: 'array',
    items: { type: 'string', minLength: 3 },
} as const;

/** The owner's decision; a request the source chat cannot show is the model's to shorten. */
async function decisionOf(ctx: ToolContext, request: ReturnType<typeof sendApprovalOf>): Promise<ApprovalDecision> {
    try {
        return await askMailApproval(ctx, request);
    } catch (error) {
        if (error instanceof ValidationError) {
            throw new ValidationError(`${error.message} The approval does not fit this chat: shorten the mail and call mail_send again; nothing was sent.`);
        }

        throw error;
    }
}

export function mailSendTool(source: MailWriteClientSource): Tool<MailSendInput, MailSendResult> {
    return defineEffectTool<MailSendInput, MailSendResult>({
        // it always asks the owner itself, with the whole mail
        trust: { guardWhenTainted: false },
        description: 'Send one plain-text mail from a mail account that can send. The owner always approves the exact ' +
            'mail first (sender, every recipient, subject and the whole text); nothing is sent before that, and a ' +
            'denial is final for this mail. When the approval is too long for the chat, shorten the mail and call ' +
            'mail_send again. Addresses are bare (alice@example.com): no display names, no lists. With inReplyTo (a ' +
            'mail id from mail_search, mail_get or mail_thread) the mail answers that mail in its thread; write the ' +
            'subject yourself (Re: ...). The result lists in refused the recipients the server did not take: tell ' +
            'the owner they did not get the mail. When it fails saying the mail may have been sent, never call ' +
            'mail_send again for it: tell the owner to check the Sent folder.',
        inputSchema: objectSchema<MailSendInput>({
            account: {
                type: 'string',
                minLength: 1,
                description: 'The account to send from, from mail_accounts.',
            },
            to: {
                ...ADDRESSES,
                minItems: 1,
                description: `Recipients (to, cc and bcc together at most ${MAIL_SEND_MAX_RECIPIENTS}).`,
            },
            cc: { ...ADDRESSES, description: 'Copy recipients.' },
            bcc: { ...ADDRESSES, description: 'Blind copy recipients: not shown to the others.' },
            subject: {
                type: 'string',
                minLength: 1,
                maxLength: MAIL_SEND_SUBJECT_MAX_CHARS,
                description: 'One line.',
            },
            text: {
                type: 'string',
                minLength: 1,
                maxLength: MAIL_SEND_TEXT_MAX_CHARS,
                description: 'The plain-text body.',
            },
            inReplyTo: {
                type: 'string',
                minLength: 1,
                description: 'The id of the mail this one answers.',
            },
        }, ['account', 'to', 'subject', 'text']),
        effectKey: (input, ctx) => mailSendKey(input, ctx),
        // a send whose record never landed: its copy in Sent (fail closed: a failed search throws)
        alreadyApplied: async (key, input, ctx) => {
            const mail = parseMailSendInput(input);
            const client = source(ctx);
            const view = client.account(mail.account);

            // execute refuses these; the unconfigured client's lookup refuses with its connection error
            if (client.configured !== false && !view?.smtp) {
                return undefined;
            }

            return client.findSent(mail.account, {
                key,
                messageId: mailMessageIdOf(key, view?.address ?? ''),
            }, ctx.run.signal);
        },
        execute: async (input, { abortSignal, context }) => {
            const mail = parseMailSendInput(input);
            const client = source(context);
            const view = client.account(mail.account);

            if (!view) {
                throw new ValidationError(`mail_send: account "${mail.account}" is unknown: see mail_accounts.`);
            }

            if (!view.smtp) {
                throw new ValidationError(`mail_send: account "${view.id}" has no smtp settings and cannot send.`);
            }

            const signal = signalOf(abortSignal, context);
            const reply = mail.inReplyTo !== undefined ? await client.replyHeaders(mail.inReplyTo, signal) : undefined;
            const decision = await decisionOf(context, sendApprovalOf(view, mail, reply));

            if (!decision.approved) {
                const reason = decision.reason ? ` Reason: ${decision.reason}` : '';

                throw new ToolDeniedError(`mail_send: not approved; nothing was sent.${reason}`);
            }

            const key = mailSendKey(input, context);

            return client.send({
                account: view.id,
                to: mail.to,
                ...(mail.cc && { cc: mail.cc }),
                ...(mail.bcc && { bcc: mail.bcc }),
                subject: mail.subject,
                text: mail.text,
                ...(reply && { reply }),
                messageId: mailMessageIdOf(key, view.address),
                marker: effectMarker(key),
            }, signal);
        },
    });
}
