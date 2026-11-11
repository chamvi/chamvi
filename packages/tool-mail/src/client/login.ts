/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/core';
import { ImapFlow } from 'imapflow';
import { MAIL_REQUEST_ERROR_CODE } from '../errors/constants.ts';
import type { MailAccountNormalized } from '../options/types.ts';

/** An unconnected imapflow client of `account`. */
export function createImapConnection(account: MailAccountNormalized): ImapFlow {
    return new ImapFlow({
        host: account.host,
        port: account.port,
        secure: account.security === 'tls',
        doSTARTTLS: account.security === 'starttls',
        auth: { user: account.user, pass: account.password },
        logger: false,
        disableAutoIdle: true,
        clientInfo: { name: 'chamvi' },
    });
}

function failure(message: string): ChamviError {
    return new ChamviError({ message, code: MAIL_REQUEST_ERROR_CODE });
}

/**
 * Logs in to `account` over IMAP and logs out: no mailbox is opened, so
 * nothing can change. Bounded by `signal`, which drops the socket. The failures
 * are a fixed set of sentences, never the server's text.
 */
export async function verifyMailLogin(account: MailAccountNormalized, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();

    const connection = createImapConnection(account);
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
    });

    // a socket failure also surfaces in connect(); without a listener it would throw uncaught
    connection.on('error', () => undefined);

    try {
        try {
            await Promise.race([connection.connect(), aborted]);
        } catch (error) {
            signal.throwIfAborted();

            throw failure((error as { authenticationFailed?: boolean }).authenticationFailed ?
                'The IMAP server refused the user or password.' :
                'The IMAP server cannot be reached.');
        }

        // the login is the answer: the logout is sent, never awaited (a server that never answers
        // it would hold a working login until the deadline); the socket closes below either way
        connection.logout().catch(() => undefined);
    } finally {
        if (onAbort) {
            signal.removeEventListener('abort', onAbort);
        }

        try {
            connection.close();
        } catch {
            // already closed
        }
    }
}
