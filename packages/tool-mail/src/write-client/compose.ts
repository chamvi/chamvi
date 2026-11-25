/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createTransport } from 'nodemailer';
import { MAIL_EFFECT_HEADER } from './constants.ts';
import type { MailSendRequest, MailSmtpAccount } from './types.ts';

/**
 * The raw message of `request` as nodemailer builds it (CRLF line ends), with its Bcc header: the copy filed in
 * Sent. `withoutBcc()` gives the bytes that are transmitted. Nothing is read from a file or a URL.
 */
export async function composeMail(account: MailSmtpAccount, request: MailSendRequest, date: Date): Promise<Buffer> {
    const transport = createTransport({
        streamTransport: true,
        buffer: true,
        newline: 'windows',
    });
    const { reply } = request;
    const info = await transport.sendMail({
        from: account.address,
        to: request.to,
        ...(request.cc && request.cc.length > 0 && { cc: request.cc }),
        ...(request.bcc && request.bcc.length > 0 && { bcc: request.bcc }),
        subject: request.subject,
        text: request.text,
        messageId: request.messageId,
        date,
        ...(reply && { inReplyTo: reply.messageId, references: reply.references }),
        // prepared: written as is, never folded, so a server search finds the whole marker
        headers: { [MAIL_EFFECT_HEADER]: { prepared: true, value: request.marker } },
        disableFileAccess: true,
        disableUrlAccess: true,
    });

    return info.message as Buffer;
}

/** `raw` without its Bcc header field (and the field's folded lines); the body is untouched. */
export function withoutBcc(raw: Buffer): Buffer {
    const end = raw.indexOf('\r\n\r\n');

    if (end === -1) {
        return raw;
    }

    const lines = raw.subarray(0, end).toString('latin1').split('\r\n');
    const kept: string[] = [];
    let dropping = false;

    for (const line of lines) {
        if (line.startsWith(' ') || line.startsWith('\t')) {
            if (!dropping) {
                kept.push(line);
            }

            continue;
        }

        dropping = /^bcc:/i.test(line);

        if (!dropping) {
            kept.push(line);
        }
    }

    return Buffer.concat([Buffer.from(kept.join('\r\n'), 'latin1'), raw.subarray(end)]);
}
