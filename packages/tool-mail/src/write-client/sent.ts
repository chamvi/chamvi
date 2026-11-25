/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ListResponse, SearchObject } from 'imapflow';
import { requestError } from '../client/asserts.ts';
import { openMailFolder } from '../client/mailbox.ts';
import type { MailConnectionPool } from '../client/pool.ts';
import { MAIL_EFFECT_HEADER } from './constants.ts';
import type { MailSmtpAccount } from './types.ts';

/** The listed `\Sent` folder (by special use only, never by name), if any. */
export function sentFolderOf(listed: ListResponse[]): string | undefined {
    const sent = listed.find((folder) => !folder.flags.has('\\Noselect') &&
        !folder.flags.has('\\NonExistent') &&
        // imapflow also guesses a special use from a folder's name: that one is not taken
        (folder.flags.has('\\Sent') || (folder.specialUse === '\\Sent' && folder.specialUseSource !== 'name')));

    return sent?.path;
}

/**
 * APPENDs `raw` to the account's `\Sent` folder with `\Seen`. Never throws: it runs after the SMTP accept, and a
 * throw would invite a second send. False when there is no `\Sent` folder or anything failed. Bounded by the
 * clock timeout only, never the run's signal: a drain or cancel after the accept still files the copy a replay's
 * `findSent` looks for.
 */
export async function appendSent(
    pool: MailConnectionPool,
    account: MailSmtpAccount,
    raw: Buffer,
): Promise<boolean> {
    try {
        return await pool.run('mail_send', account, undefined, async (connection) => {
            const sent = sentFolderOf(await pool.folders(connection, account));

            if (!sent) {
                return false;
            }

            return !!await connection.append(sent, raw, ['\\Seen']);
        });
    } catch {
        return false;
    }
}

/**
 * Whether the account's `\Sent` folder (EXAMINE) holds the mail of `lookup`: generic accounts by the
 * X-Chamvi-Effect header or the Message-ID, Gmail by Message-ID (Gmail does not index custom headers). False without a `\Sent`
 * folder; a failed search throws.
 */
export async function findSentMail(
    pool: MailConnectionPool,
    account: MailSmtpAccount,
    lookup: { key: string; messageId: string },
    signal?: AbortSignal,
): Promise<boolean> {
    return pool.run('mail_send', account, signal, async (connection) => {
        const sent = sentFolderOf(await pool.folders(connection, account));

        if (!sent) {
            return false;
        }

        const criteria: SearchObject = account.gmail ?
            { gmraw: `rfc822msgid:${lookup.messageId}` } :
            // the derived Message-ID too: not every server indexes custom headers
            { or: [{ header: { [MAIL_EFFECT_HEADER]: lookup.key } }, { header: { 'Message-ID': lookup.messageId } }] };

        return openMailFolder(connection, sent, async () => {
            const uids = await connection.search(criteria, { uid: true });

            if (!Array.isArray(uids)) {
                throw requestError('mail_send', account.id, 'request failed');
            }

            return uids.length > 0;
        });
    });
}
