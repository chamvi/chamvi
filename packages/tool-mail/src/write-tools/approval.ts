/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { approve } from '@chamvi/core';
import type { ApprovalDecision, ApprovalRequestInput, ToolContext } from '@chamvi/core';
import type {
    MailDeleteItem,
    MailDeleteListing,
    MailReplyHeaders,
    MailWriteAccountView,
} from '../write-client/types.ts';
import { MAIL_APPROVAL_FIELD_MAX_CHARS } from './constants.ts';
import type { MailSendInput } from './types.ts';

/** One line of untrusted text: control characters as spaces, cut at `MAIL_APPROVAL_FIELD_MAX_CHARS` characters. */
export function lineOf(value: string): string {
    // eslint-disable-next-line no-control-regex
    const line = value.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ');

    return Array.from(line).slice(0, MAIL_APPROVAL_FIELD_MAX_CHARS).join('');
}

/**
 * Asks the owner through the run's source channel (when it has `out`), else through the inbox and the API
 * only (`approve()`). A channel that cannot render the request throws its ValidationError before the call
 * suspends.
 */
export async function askMailApproval(ctx: ToolContext, request: ApprovalRequestInput): Promise<ApprovalDecision> {
    const handle = ctx.channels.findOne();

    return handle ? handle.approve(request) : approve(ctx, request);
}

/** The approval of a send: the sender, every recipient, the subject, the answered mail and the whole text, never cut. */
export function sendApprovalOf(view: MailWriteAccountView, input: MailSendInput, reply?: MailReplyHeaders): ApprovalRequestInput {
    const lines = [
        `From: ${view.address}`,
        `To: ${input.to.join(', ')}`,
    ];

    if (input.cc && input.cc.length > 0) {
        lines.push(`Cc: ${input.cc.join(', ')}`);
    }

    if (input.bcc && input.bcc.length > 0) {
        lines.push(`Bcc: ${input.bcc.join(', ')}`);
    }

    lines.push(`Subject: ${input.subject}`);

    if (reply) {
        lines.push(`In reply to: ${lineOf(reply.from)}: ${lineOf(reply.subject)}`);
    }

    lines.push('', input.text);

    return {
        title: `Send mail from ${view.id}?`,
        body: lines.join('\n'),
    };
}

/** `<YYYY-MM-DD HH:MM> UTC` of an ISO date; an unreadable one as one cut line. */
function minuteOf(date: string): string {
    const time = new Date(date);

    if (Number.isNaN(time.getTime())) {
        return lineOf(date);
    }

    const iso = time.toISOString();

    return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** One line per mail: `<date> UTC | <from> | <subject> | <folder>`, each field one line of at most 200 characters. */
export function deleteListingOf(mails: MailDeleteItem[]): string {
    return mails
        .map((mail) => [minuteOf(mail.date), lineOf(mail.from), lineOf(mail.subject), lineOf(mail.folder)].join(' | '))
        .join('\n');
}

/** The approval of a delete: how many mails of which account, and the listing of the mails that exist, in input order. */
export function deleteApprovalOf(listing: MailDeleteListing): ApprovalRequestInput {
    const count = listing.mails.length;

    return {
        title: `Delete ${count} ${count === 1 ? 'mail' : 'mails'} from ${listing.account}?`,
        body: deleteListingOf(listing.mails),
    };
}
