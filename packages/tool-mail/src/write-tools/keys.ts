/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import type { MailSendInput } from './types.ts';

function sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

/**
 * The effect key of a send: the run and the whole mail as given, so a replay of the same call (and only
 * that) finds its record or its sent copy.
 */
export function mailSendKey(input: MailSendInput, ctx: { run: { runId: string } }): string {
    const mail = [
        input.account,
        input.to,
        input.cc ?? [],
        input.bcc ?? [],
        input.subject,
        input.text,
        input.inReplyTo ?? null,
    ];

    return `${ctx.run.runId}:mail_send:${sha256Hex(JSON.stringify(mail))}`;
}

/** The Message-ID of the send keyed `key` from `address`: `<hash.chamvi@domain>`, the same on every replay. */
export function mailMessageIdOf(key: string, address: string): string {
    const domain = address.slice(address.lastIndexOf('@') + 1);

    return `<${sha256Hex(key).slice(0, 32)}.chamvi@${domain}>`;
}
