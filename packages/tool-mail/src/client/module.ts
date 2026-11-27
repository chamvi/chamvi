/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import { ValidationError } from '@chamvi/errors';
import type { ImapFlow, SearchObject } from 'imapflow';
import PostalMime from 'postal-mime';
import { EXTRACTION_FAILED_TEXT } from '../attachment/constants.ts';
import { extractAttachmentText } from '../attachment/module.ts';
import { normalizeAccounts, normalizeTiming } from '../options/module.ts';
import type { MailAccountNormalized } from '../options/types.ts';
import {
    MAIL_ATTACHMENT_MAX_CHARS,
    MAIL_BODY_MAX_CHARS,
    MAIL_FETCH_MAX_BYTES,
    MAIL_INVITES_MAX,
} from '../text/constants.ts';
import { icsSummary, stripHtml } from '../text/module.ts';
import { requestError } from './asserts.ts';
import {
    MAIL_SEARCH_DEFAULT_LIMIT,
    MAIL_STALE_ID_MESSAGE,
    MAIL_SUMMARY_QUERY,
    MAIL_THREAD_MAX_REFERENCES,
} from './constants.ts';
import { isAllowedFolder, searchFolders, threadFolders } from './folders.ts';
import { parseMailId } from './ids.ts';
import { fetchMailMessage, openMailFolder } from './mailbox.ts';
import {
    addressListOf,
    dateOf,
    headerValues,
    messageIds,
    pageOf,
    subjectOf,
} from './message.ts';
import { MailConnectionPool } from './pool.ts';
import { mailSearchCriteria, mergeMailSummaries, searchMailFolder } from './search.ts';
import { attachmentsOf, decodeTransfer, sectionOf } from './structure.ts';
import type {
    IMailClient,
    MailAccount,
    MailAccountView,
    MailAttachmentText,
    MailClientOptions,
    MailFound,
    MailIdParts,
    MailMessage,
    MailSearchInput,
    MailSearchResult,
} from './types.ts';

/** A read-only IMAP client: one lazy imapflow connection per account, calls serialised per account. */
class MailClient implements IMailClient {
    private readonly accountsById: Map<string, MailAccountNormalized>;

    private readonly pool: MailConnectionPool;

    constructor(accounts: MailAccountNormalized[], options: { clock: IClock; timeoutMs: number }) {
        this.accountsById = new Map(accounts.map((account) => [account.id, account]));
        this.pool = new MailConnectionPool(options);
    }

    async accounts(signal?: AbortSignal): Promise<MailAccountView[]> {
        return Promise.all(this.accountsById.values().toArray().map((account) => this.pool.run('mail_accounts', account, signal, async (connection) => ({
            account: account.id,
            address: account.address,
            folders: (await this.pool.folders(connection, account)).map((folder) => ({
                path: folder.path,
                ...(folder.specialUse && { specialUse: folder.specialUse }),
            })),
        }))));
    }

    async search(input: MailSearchInput, signal?: AbortSignal): Promise<MailSearchResult> {
        const account = this.account(input.account, 'account');
        const limit = input.limit ?? MAIL_SEARCH_DEFAULT_LIMIT;
        const criteria = mailSearchCriteria(input, account);

        return this.pool.run('mail_search', account, signal, async (connection) => {
            const listed = await this.pool.folders(connection, account);

            if (input.folder !== undefined && !isAllowedFolder(account, listed, input.folder)) {
                throw new ValidationError(`folder ${JSON.stringify(input.folder)} is not a folder of account ${account.id}: see mail_accounts.`);
            }

            const folders = input.folder === undefined ? searchFolders(account, listed) : [input.folder];
            const found: MailFound[] = [];
            let total = 0;

            for (const folder of folders) {
                const result = await searchMailFolder(connection, account, folder, criteria, limit);

                total += result.total;
                found.push(...result.found);
            }

            return mergeMailSummaries(found, limit, total);
        });
    }

    async get(id: string, offset = 0, signal?: AbortSignal): Promise<MailMessage> {
        const parts = parseMailId(id);
        const account = this.account(parts.account, 'id');

        const fetched = await this.pool.run('mail_get', account, signal, async (connection) => this.inMail(connection, account, parts, async () => {
            const meta = await fetchMailMessage(connection, parts, {
                ...MAIL_SUMMARY_QUERY,
                headers: ['references'],
            });
            const size = meta.size ?? 0;

            if (size > MAIL_FETCH_MAX_BYTES) {
                return { meta, source: undefined };
            }

            const full = await fetchMailMessage(connection, parts, { uid: true, source: true });

            return { meta, source: full.source };
        }));

        const { meta, source } = fetched;
        const envelope = meta.envelope ?? {};
        let body = '';
        const invites: string[] = [];

        if (source) {
            const email = await PostalMime.parse(source);

            body = email.text?.trim() ? email.text.trim() : stripHtml(email.html ?? '');

            for (const attachment of email.attachments) {
                if (invites.length >= MAIL_INVITES_MAX) {
                    break;
                }

                const name = (attachment.filename ?? '').toLowerCase();

                if (attachment.mimeType === 'text/calendar' || attachment.mimeType === 'application/ics' || name.endsWith('.ics')) {
                    const content = typeof attachment.content === 'string' ?
                        attachment.content :
                        new TextDecoder().decode(attachment.content);
                    const summary = icsSummary(content);

                    if (summary) {
                        invites.push(summary);
                    }
                }
            }
        }

        const text = pageOf(body, offset, MAIL_BODY_MAX_CHARS);

        return {
            id,
            account: account.id,
            folder: parts.folder,
            date: dateOf(meta).toISOString(),
            from: addressListOf(envelope.from),
            to: addressListOf(envelope.to),
            cc: addressListOf(envelope.cc),
            subject: subjectOf(envelope.subject),
            ...(envelope.messageId && { messageId: envelope.messageId }),
            ...(envelope.inReplyTo && { inReplyTo: envelope.inReplyTo }),
            references: messageIds(headerValues(meta.headers).get('references') ?? '').length,
            unread: !meta.flags?.has('\\Seen'),
            invites,
            body: text.content,
            offset: text.offset,
            totalChars: text.totalChars,
            ...(text.nextOffset !== undefined && { nextOffset: text.nextOffset }),
            attachments: attachmentsOf(meta.bodyStructure).map((attachment) => attachment.info),
            truncated: !source,
        };
    }

    async attachment(id: string, index: number, offset = 0, signal?: AbortSignal): Promise<MailAttachmentText> {
        const parts = parseMailId(id);
        const account = this.account(parts.account, 'id');

        const fetched = await this.pool.run('mail_attachment', account, signal, async (connection) => this.inMail(connection, account, parts, async () => {
            const meta = await fetchMailMessage(connection, parts, { uid: true, bodyStructure: true });
            const attachments = attachmentsOf(meta.bodyStructure);
            const attachment = attachments[index];

            if (!attachment) {
                throw new ValidationError(`index ${index} is not an attachment of this mail (it has ${attachments.length}).`);
            }

            if ((attachment.node.size ?? 0) > MAIL_FETCH_MAX_BYTES) {
                return { attachment, data: undefined };
            }

            const section = sectionOf(attachment.node);
            const message = await fetchMailMessage(connection, parts, { uid: true, bodyParts: [section] });

            return { attachment, data: message.bodyParts?.get(section.toLowerCase()) };
        }));

        const { attachment, data } = fetched;
        const text = data ?
            await extractAttachmentText(decodeTransfer(data, attachment.node.encoding), attachment.info.mediaType, attachment.info.filename, signal) :
            EXTRACTION_FAILED_TEXT;
        const result = pageOf(text, offset, MAIL_ATTACHMENT_MAX_CHARS);

        return {
            id,
            index,
            filename: attachment.info.filename,
            mediaType: attachment.info.mediaType,
            text: result.content,
            offset: result.offset,
            totalChars: result.totalChars,
            ...(result.nextOffset !== undefined && { nextOffset: result.nextOffset }),
        };
    }

    async thread(id: string, limit = MAIL_SEARCH_DEFAULT_LIMIT, signal?: AbortSignal): Promise<MailSearchResult> {
        const parts = parseMailId(id);
        const account = this.account(parts.account, 'id');

        return this.pool.run('mail_thread', account, signal, async (connection) => {
            const meta = await this.inMail(connection, account, parts, async () => fetchMailMessage(connection, parts, account.gmail ?
                { uid: true, threadId: true } :
                { uid: true, headers: ['message-id', 'in-reply-to', 'references'] }));
            const listed = await this.pool.folders(connection, account);
            let criteria: SearchObject;
            let own: string | undefined;

            if (account.gmail) {
                if (!meta.threadId) {
                    throw requestError('mail_thread', account.id, 'no thread id');
                }

                criteria = { threadId: meta.threadId };
            } else {
                const headers = headerValues(meta.headers);

                [own] = messageIds(headers.get('message-id') ?? '');

                const ids = [...new Set([
                    ...(own ? [own] : []),
                    ...messageIds(headers.get('in-reply-to') ?? ''),
                    ...messageIds(headers.get('references') ?? '').slice(-MAIL_THREAD_MAX_REFERENCES),
                ])];

                if (ids.length === 0) {
                    return { mails: [], truncated: false };
                }

                criteria = {
                    or: ids.flatMap((value): SearchObject[] => [
                        { header: { 'message-id': value } },
                        { header: { 'in-reply-to': value } },
                        { header: { references: value } },
                    ]),
                };
            }

            const found: MailFound[] = [];
            const seen = new Set<string>(own ? [own] : []);
            let total = 0;

            for (const folder of threadFolders(account, listed)) {
                const result = await searchMailFolder(connection, account, folder, criteria, limit, parts);

                for (const entry of result.found) {
                    if (entry.messageId && seen.has(entry.messageId)) {
                        continue;
                    }

                    if (entry.messageId) {
                        seen.add(entry.messageId);
                    }

                    found.push(entry);
                    total++;
                }

                total += result.total - result.found.length;
            }

            return mergeMailSummaries(found, limit, total);
        });
    }

    async close(): Promise<void> {
        await this.pool.close();
    }

    private account(id: string, field: string): MailAccountNormalized {
        const account = this.accountsById.get(id);

        if (!account) {
            throw new ValidationError(`${field} names no mail account (${this.accountsById.keys().toArray().join(', ')}): see mail_accounts.`);
        }

        return account;
    }

    /** Checks the id's folder against the account before opening it, then its UIDVALIDITY. */
    private async inMail<T>(
        connection: ImapFlow,
        account: MailAccountNormalized,
        parts: MailIdParts,
        operation: () => Promise<T>,
    ): Promise<T> {
        const listed = await this.pool.folders(connection, account);

        if (!isAllowedFolder(account, listed, parts.folder)) {
            throw new ValidationError('id names a folder this account does not read: search again.');
        }

        return openMailFolder(connection, parts.folder, async (uidValidity) => {
            if (uidValidity !== parts.uidValidity) {
                throw new ValidationError(MAIL_STALE_ID_MESSAGE);
            }

            return operation();
        });
    }
}

/**
 * A read-only IMAP client over `accounts`: EXAMINE only (never SELECT), body fetches only with BODY.PEEK, no
 * IDLE; a call runs at most `timeoutMs` (default 30 s) on the clock. InvalidAgentDefinitionError for bad
 * accounts, without echoing any value.
 */
export function createMailClient(accounts: MailAccount[], options: MailClientOptions = {}): IMailClient {
    return new MailClient(
        normalizeAccounts(accounts, 'createMailClient()'),
        normalizeTiming(options, 'createMailClient()'),
    );
}
