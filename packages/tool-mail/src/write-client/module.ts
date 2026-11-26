/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import { ChamviError, ValidationError } from '@chamvi/errors';
import { requestError } from '../client/asserts.ts';
import { MAIL_STALE_ID_MESSAGE, MAIL_THREAD_MAX_REFERENCES } from '../client/constants.ts';
import { isAllowedFolder } from '../client/folders.ts';
import { parseMailId } from '../client/ids.ts';
import { fetchMailMessage, openMailFolder } from '../client/mailbox.ts';
import {
    addressListOf,
    headerValues,
    messageIds,
    subjectOf,
} from '../client/message.ts';
import { MailConnectionPool } from '../client/pool.ts';
import type { MailClientOptions } from '../client/types.ts';
import { normalizeAccounts, normalizeTiming } from '../options/module.ts';
import { normalizeSmtp } from './asserts.ts';
import { composeMail, withoutBcc } from './compose.ts';
import { appendSent, findSentMail } from './sent.ts';
import { sendSmtp } from './smtp.ts';
import { describeMails, mailDeleteTargetsOf, trashMails } from './trash.ts';
import type {
    IMailWriteClient,
    MailDeleteListing,
    MailDeleteResult,
    MailReplyHeaders,
    MailSendRequest,
    MailSendResult,
    MailSmtpAccount,
    MailWriteAccount,
    MailWriteAccountNormalized,
    MailWriteAccountView,
} from './types.ts';

const CALLER = 'createMailWriteClient()';

/** Sends over SMTP and files in Sent; its own imapflow connections (and folder cache), separate from the read client. */
class MailWriteClient implements IMailWriteClient {
    private readonly accountsById: Map<string, MailWriteAccountNormalized>;

    private readonly timing: { clock: IClock; timeoutMs: number };

    private readonly pool: MailConnectionPool;

    constructor(accounts: MailWriteAccountNormalized[], timing: { clock: IClock; timeoutMs: number }) {
        this.accountsById = new Map(accounts.map((account) => [account.id, account]));
        this.timing = timing;
        this.pool = new MailConnectionPool(timing);
    }

    account(id: string): MailWriteAccountView | undefined {
        const account = this.accountsById.get(id);

        if (!account) {
            return undefined;
        }

        return {
            id: account.id,
            address: account.address,
            gmail: account.gmail,
            smtp: account.smtp !== undefined,
        };
    }

    async send(request: MailSendRequest, signal?: AbortSignal): Promise<MailSendResult> {
        const account = this.sender(request.account);

        signal?.throwIfAborted();

        let copy: Buffer;

        try {
            copy = await composeMail(account, request, new Date(this.timing.clock.now()));
        } catch (error) {
            if (error instanceof ChamviError) {
                throw error;
            }

            throw requestError('mail_send', account.id, 'request failed');
        }

        const recipients = [...request.to, ...request.cc ?? [], ...request.bcc ?? []];
        const rejected = await sendSmtp(account, withoutBcc(copy), { from: account.address, to: recipients }, this.timing, signal);
        // the request's own addresses only, never what the server wrote
        const refused = recipients.filter((address) => rejected.has(address.toLowerCase()));

        // accepted: from here on nothing throws. Gmail files what it sends itself; elsewhere the copy (with Bcc) is APPENDed
        const filed = account.gmail || await appendSent(this.pool, account, copy);

        return {
            account: account.id,
            messageId: request.messageId,
            filed,
            refused,
        };
    }

    async findSent(id: string, lookup: { key: string; messageId: string }, signal?: AbortSignal): Promise<MailSendResult | undefined> {
        const account = this.known(id, 'account');

        if (!account.smtp) {
            return undefined;
        }

        const found = await findSentMail(this.pool, account as MailSmtpAccount, lookup, signal);

        return found ? {
            account: account.id,
            messageId: lookup.messageId,
            filed: true,
            refused: [],
        } : undefined;
    }

    async describe(ids: string[], signal?: AbortSignal): Promise<MailDeleteListing> {
        const { account, targets } = mailDeleteTargetsOf(ids);

        return describeMails(this.pool, this.known(account, 'ids'), targets, signal);
    }

    async trash(ids: string[], signal?: AbortSignal): Promise<MailDeleteResult> {
        const { account, targets } = mailDeleteTargetsOf(ids);

        return trashMails(this.pool, this.known(account, 'ids'), targets, signal);
    }

    async replyHeaders(id: string, signal?: AbortSignal): Promise<MailReplyHeaders> {
        const parts = parseMailId(id);
        const account = this.known(parts.account, 'inReplyTo');

        const meta = await this.pool.run('mail_send', account, signal, async (connection) => {
            const listed = await this.pool.folders(connection, account);

            if (!isAllowedFolder(account, listed, parts.folder)) {
                throw new ValidationError('inReplyTo names a folder this account does not read: search again.');
            }

            return openMailFolder(connection, parts.folder, async (uidValidity) => {
                if (uidValidity !== parts.uidValidity) {
                    throw new ValidationError(MAIL_STALE_ID_MESSAGE);
                }

                return fetchMailMessage(connection, parts, {
                    uid: true,
                    envelope: true,
                    headers: ['references'],
                });
            });
        });
        const envelope = meta.envelope ?? {};
        const [messageId] = messageIds(envelope.messageId ?? '');

        if (!messageId) {
            throw new ValidationError('inReplyTo names a mail without a Message-ID: send the mail without inReplyTo.');
        }

        const references = messageIds(headerValues(meta.headers).get('references') ?? '').slice(-MAIL_THREAD_MAX_REFERENCES);

        return {
            messageId,
            references: [...new Set([...references, messageId])],
            from: addressListOf(envelope.from),
            subject: subjectOf(envelope.subject),
        };
    }

    async close(): Promise<void> {
        await this.pool.close();
    }

    private known(id: string, field: string): MailWriteAccountNormalized {
        const account = this.accountsById.get(id);

        if (!account) {
            throw new ValidationError(`${field} names no mail account (${this.accountsById.keys().toArray().join(', ')}): see mail_accounts.`);
        }

        return account;
    }

    private sender(id: string): MailSmtpAccount {
        const account = this.known(id, 'account');

        if (!account.smtp) {
            throw new ValidationError(`mail_send: account "${account.id}" has no smtp settings and cannot send.`);
        }

        return account as MailSmtpAccount;
    }
}

/**
 * A mail client that writes: sends over SMTP (one nodemailer transport per send) and files the mail in Sent
 * over IMAP (APPEND), and moves mails to the `\\Trash` folder (SELECT right before each `UID MOVE`, never
 * CLOSE, refused without a native MOVE); every other open is EXAMINE. A call runs at most `timeoutMs` (default 30 s) on the clock.
 * InvalidAgentDefinitionError for bad accounts or SMTP settings, without echoing any value.
 */
export function createMailWriteClient(accounts: MailWriteAccount[], options: MailClientOptions = {}): IMailWriteClient {
    const normalized = normalizeAccounts(accounts, CALLER).map((account, index): MailWriteAccountNormalized => {
        const { smtp } = accounts[index]!;

        return smtp === undefined ? account : { ...account, smtp: normalizeSmtp(smtp, `${CALLER} accounts[${index}].smtp`) };
    });

    return new MailWriteClient(normalized, normalizeTiming(options, CALLER));
}

