/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { approve } from '@chamvi/core';
import type { ApprovalDecision, ApprovalRequestInput, ToolContext } from '@chamvi/core';
import type { MailReplyHeaders, MailWriteAccountView } from '../write-client/types.ts';
import { MAIL_APPROVAL_FIELD_MAX_CHARS } from './constants.ts';
import type { MailSendInput } from './types.ts';

/** One line of untrusted text: control characters as spaces, cut at `MAIL_APPROVAL_FIELD_MAX_CHARS` characters. */
function lineOf(value: string): string {
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
