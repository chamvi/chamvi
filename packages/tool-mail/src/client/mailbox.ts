/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import type { FetchMessageObject, ImapFlow } from 'imapflow';
import { MAIL_STALE_ID_MESSAGE } from './constants.ts';
import type { MailIdParts } from './types.ts';

/** Opens `path` read-only (EXAMINE; without `readOnly` imapflow sends SELECT) for `operation`. */
export async function openMailFolder<T>(connection: ImapFlow, path: string, operation: (uidValidity: string) => Promise<T>): Promise<T> {
    const lock = await connection.getMailboxLock(path, { readOnly: true });

    try {
        const { mailbox } = connection;

        return await operation(mailbox ? String(mailbox.uidValidity) : '');
    } finally {
        lock.release();
    }
}

export async function fetchMailMessage(
    connection: ImapFlow,
    parts: MailIdParts,
    query: Parameters<ImapFlow['fetchOne']>[1],
): Promise<FetchMessageObject> {
    const message = await connection.fetchOne(String(parts.uid), query, { uid: true });

    if (!message) {
        throw new ValidationError(MAIL_STALE_ID_MESSAGE);
    }

    return message;
}
