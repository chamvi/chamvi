/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import { ChamviError, ValidationError } from '@chamvi/core';
import { ImapFlow } from 'imapflow';
import type {
    FetchMessageObject,
    ListResponse,
    MessageAddressObject,
    SearchObject,
} from 'imapflow';
import PostalMime from 'postal-mime';
import { EXTRACTION_FAILED_TEXT } from '../attachment/constants.ts';
import { extractAttachmentText } from '../attachment/module.ts';
import { normalizeAccounts, normalizeTiming } from '../options/module.ts';
import type { MailAccountNormalized } from '../options/types.ts';
import {
    MAIL_ADDRESSES_MAX_CHARS,
    MAIL_ATTACHMENT_MAX_CHARS,
    MAIL_BODY_MAX_CHARS,
    MAIL_FETCH_MAX_BYTES,
    MAIL_INVITES_MAX,
    MAIL_SUBJECT_MAX_CHARS,
} from '../text/constants.ts';
import {
    addresses,
    cutText,
    icsSummary,
    stripHtml,
} from '../text/module.ts';
import { requestError } from './asserts.ts';
import {
    MAIL_SEARCH_DEFAULT_LIMIT,
    MAIL_SNIPPET_BYTES,
    MAIL_SNIPPET_CHARS,
    MAIL_STALE_ID_MESSAGE,
    MAIL_THREAD_MAX_REFERENCES,
} from './constants.ts';
import { isAllowedFolder, searchFolders, threadFolders } from './folders.ts';
import { encodeMailId, parseMailId } from './ids.ts';
import { createQueue } from './queue.ts';
import {
    attachmentsOf,
    decodeText,
    decodeTransfer,
    sectionOf,
    textPartOf,
} from './structure.ts';
import type {
    IMailClient,
    MailAccount,
    MailAccountView,
    MailAttachmentText,
    MailClientOptions,
    MailIdParts,
    MailMessage,
    MailSearchInput,
    MailSearchResult,
    MailSummary,
} from './types.ts';

/** A summary with what merging and deduplicating needs. */
type Found = {
    summary: MailSummary;
    time: number;
    messageId?: string;
};

/** The fetch query of a search result. */
const SUMMARY_QUERY = {
    uid: true,
    envelope: true,
    flags: true,
    internalDate: true,
    bodyStructure: true,
    size: true,
} as const;

const TIMED_OUT = Symbol('timed out');

function dateOf(message: FetchMessageObject): Date {
    const envelope = message.envelope?.date;

    if (envelope instanceof Date && !Number.isNaN(envelope.getTime())) {
        return envelope;
    }

    const internal = message.internalDate;

    return internal instanceof Date ? internal : new Date(0);
}

/** An address list, cut at `MAIL_ADDRESSES_MAX_CHARS`. */
function list(value: MessageAddressObject[] | undefined): string {
    return cutText(addresses(value?.map((entry) => ({
        ...(entry.name && { name: entry.name }),
        ...(entry.address && { address: entry.address }),
    }))), 0, MAIL_ADDRESSES_MAX_CHARS);
}

/** A subject, cut at `MAIL_SUBJECT_MAX_CHARS`. */
function subjectOf(value: string | undefined): string {
    return cutText(value ?? '', 0, MAIL_SUBJECT_MAX_CHARS);
}

/** The `<...>` message ids in a header value. */
function messageIds(value: string): string[] {
    return value.match(/<[^<>\s]+>/g) ?? [];
}

/** Header values by lower-cased name, folded lines joined. */
function headerValues(data: Uint8Array | undefined): Map<string, string> {
    const values = new Map<string, string>();
    const text = Buffer.from(data ?? new Uint8Array(0)).toString('utf8').replace(/\r?\n[ \t]+/g, ' ');

    for (const line of text.split(/\r?\n/)) {
        const colon = line.indexOf(':');

        if (colon > 0) {
            const name = line.slice(0, colon).trim().toLowerCase();

            values.set(name, `${values.get(name) ?? ''} ${line.slice(colon + 1).trim()}`.trim());
        }
    }

    return values;
}

function snippetOf(text: string, html: boolean): string {
    const plain = html ? stripHtml(text) : text;

    return plain.replace(/\s+/g, ' ').trim().slice(0, MAIL_SNIPPET_CHARS);
}

function page(text: string, offset: number, max: number) {
    if (offset > 0 && offset >= text.length) {
        throw new ValidationError(`offset ${offset} is past the end (${text.length} characters).`);
    }

    const content = cutText(text, offset, max);
    const next = offset + content.length;

    return {
        content,
        offset,
        totalChars: text.length,
        ...(next < text.length && { nextOffset: next }),
    };
}

/** A read-only IMAP client: one lazy imapflow connection per account, calls serialised per account. */
class MailClient implements IMailClient {
    private readonly accountsById: Map<string, MailAccountNormalized>;

    private readonly clock: IClock;

    private readonly timeoutMs: number;

    private readonly connections = new Map<string, ImapFlow>();

    private readonly listed = new Map<string, ListResponse[]>();

    private readonly enqueue = createQueue();

    constructor(accounts: MailAccountNormalized[], options: { clock: IClock; timeoutMs: number }) {
        this.accountsById = new Map(accounts.map((account) => [account.id, account]));
        this.clock = options.clock;
        this.timeoutMs = options.timeoutMs;
    }

    async accounts(signal?: AbortSignal): Promise<MailAccountView[]> {
        return Promise.all(this.accountsById.values().toArray().map((account) => this.run('mail_accounts', account, signal, async (connection) => ({
            account: account.id,
            address: account.address,
            folders: (await this.folders(connection, account)).map((folder) => ({
                path: folder.path,
                ...(folder.specialUse && { specialUse: folder.specialUse }),
            })),
        }))));
    }

    async search(input: MailSearchInput, signal?: AbortSignal): Promise<MailSearchResult> {
        const account = this.account(input.account, 'account');
        const limit = input.limit ?? MAIL_SEARCH_DEFAULT_LIMIT;
        const criteria = this.criteria(input, account);

        return this.run('mail_search', account, signal, async (connection) => {
            const listed = await this.folders(connection, account);

            if (input.folder !== undefined && !isAllowedFolder(account, listed, input.folder)) {
                throw new ValidationError(`folder ${JSON.stringify(input.folder)} is not a folder of account ${account.id}: see mail_accounts.`);
            }

            const folders = input.folder === undefined ? searchFolders(account, listed) : [input.folder];
            const found: Found[] = [];
            let total = 0;

            for (const folder of folders) {
                const result = await this.searchFolder(connection, account, folder, criteria, limit);

                total += result.total;
                found.push(...result.found);
            }

            return this.merge(found, limit, total);
        });
    }

    async get(id: string, offset = 0, signal?: AbortSignal): Promise<MailMessage> {
        const parts = parseMailId(id);
        const account = this.account(parts.account, 'id');

        const fetched = await this.run('mail_get', account, signal, async (connection) => this.inMail(connection, account, parts, async () => {
            const meta = await this.fetchOne(connection, parts, {
                ...SUMMARY_QUERY,
                headers: ['references'],
            });
            const size = meta.size ?? 0;

            if (size > MAIL_FETCH_MAX_BYTES) {
                return { meta, source: undefined };
            }

            const full = await this.fetchOne(connection, parts, { uid: true, source: true });

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

        const text = page(body, offset, MAIL_BODY_MAX_CHARS);

        return {
            id,
            account: account.id,
            folder: parts.folder,
            date: dateOf(meta).toISOString(),
            from: list(envelope.from),
            to: list(envelope.to),
            cc: list(envelope.cc),
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

        const fetched = await this.run('mail_attachment', account, signal, async (connection) => this.inMail(connection, account, parts, async () => {
            const meta = await this.fetchOne(connection, parts, { uid: true, bodyStructure: true });
            const attachments = attachmentsOf(meta.bodyStructure);
            const attachment = attachments[index];

            if (!attachment) {
                throw new ValidationError(`index ${index} is not an attachment of this mail (it has ${attachments.length}).`);
            }

            if ((attachment.node.size ?? 0) > MAIL_FETCH_MAX_BYTES) {
                return { attachment, data: undefined };
            }

            const section = sectionOf(attachment.node);
            const message = await this.fetchOne(connection, parts, { uid: true, bodyParts: [section] });

            return { attachment, data: message.bodyParts?.get(section.toLowerCase()) };
        }));

        const { attachment, data } = fetched;
        const text = data ?
            await extractAttachmentText(decodeTransfer(data, attachment.node.encoding), attachment.info.mediaType, attachment.info.filename, signal) :
            EXTRACTION_FAILED_TEXT;
        const result = page(text, offset, MAIL_ATTACHMENT_MAX_CHARS);

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

        return this.run('mail_thread', account, signal, async (connection) => {
            const meta = await this.inMail(connection, account, parts, async () => this.fetchOne(connection, parts, account.gmail ?
                { uid: true, threadId: true } :
                { uid: true, headers: ['message-id', 'in-reply-to', 'references'] }));
            const listed = await this.folders(connection, account);
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

            const found: Found[] = [];
            const seen = new Set<string>(own ? [own] : []);
            let total = 0;

            for (const folder of threadFolders(account, listed)) {
                const result = await this.searchFolder(connection, account, folder, criteria, limit, parts);

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

            return this.merge(found, limit, total);
        });
    }

    async close(): Promise<void> {
        const connections = this.connections.values().toArray();

        this.connections.clear();

        await Promise.all(connections.map(async (connection) => {
            let timer: { clear(): void } | undefined;

            try {
                await Promise.race([
                    connection.logout(),
                    new Promise<void>((resolve) => {
                        timer = this.clock.setTimeout(resolve, this.timeoutMs);
                    }),
                ]);
            } catch {
                // the connection is gone anyway
            } finally {
                timer?.clear();
                connection.close();
            }
        }));
    }

    private account(id: string, field: string): MailAccountNormalized {
        const account = this.accountsById.get(id);

        if (!account) {
            throw new ValidationError(`${field} names no mail account (${this.accountsById.keys().toArray().join(', ')}): see mail_accounts.`);
        }

        return account;
    }

    private criteria(input: MailSearchInput, account: MailAccountNormalized): SearchObject {
        const criteria: SearchObject = {};

        if (input.query !== undefined) {
            if (account.gmail) {
                criteria.gmraw = input.query;
            } else {
                criteria.text = input.query;
            }
        }

        for (const name of ['from', 'to', 'subject', 'since', 'before'] as const) {
            if (input[name] !== undefined) {
                Object.assign(criteria, { [name]: input[name] });
            }
        }

        if (input.unread) {
            criteria.seen = false;
        }

        return Object.keys(criteria).length > 0 ? criteria : { all: true };
    }

    /**
     * Runs `operation` on the account's connection in the account's queue, racing the timeout on the clock and
     * the signal. A timeout or an abort drops the connection (the next call reconnects); any failure that is not
     * a ChamviError becomes `request failed`, never the server's text.
     */
    private async run<T>(
        tool: string,
        account: MailAccountNormalized,
        signal: AbortSignal | undefined,
        operation: (connection: ImapFlow) => Promise<T>,
    ): Promise<T> {
        signal?.throwIfAborted();

        let timer: { clear(): void } | undefined;
        let stopped = false;
        let used: ImapFlow | undefined;
        let onAbort: (() => void) | undefined;
        const interrupted = new Promise<never>((_, reject) => {
            timer = this.clock.setTimeout(() => reject(TIMED_OUT), this.timeoutMs);
            onAbort = () => reject(signal?.reason);
            signal?.addEventListener('abort', onAbort, { once: true });
        });

        interrupted.catch(() => undefined);

        const task = async () => {
            if (stopped) {
                throw TIMED_OUT;
            }

            used = await this.connection(tool, account);

            return operation(used);
        };

        try {
            return await Promise.race([this.enqueue(account.id, () => Promise.race([task(), interrupted])), interrupted]);
        } catch (error) {
            if (error === TIMED_OUT || signal?.aborted) {
                stopped = true;

                if (used) {
                    this.drop(account.id, used);
                }

                if (error === TIMED_OUT) {
                    throw requestError(tool, account.id, 'timed out');
                }

                throw error;
            }

            if (error instanceof ChamviError) {
                throw error;
            }

            throw requestError(tool, account.id, 'request failed');
        } finally {
            timer?.clear();

            if (onAbort) {
                signal?.removeEventListener('abort', onAbort);
            }
        }
    }

    private async connection(tool: string, account: MailAccountNormalized): Promise<ImapFlow> {
        const current = this.connections.get(account.id);

        if (current?.usable) {
            return current;
        }

        if (current) {
            this.drop(account.id, current);
        }

        const connection = new ImapFlow({
            host: account.host,
            port: account.port,
            secure: account.security === 'tls',
            doSTARTTLS: account.security === 'starttls',
            auth: { user: account.user, pass: account.password },
            logger: false,
            disableAutoIdle: true,
            clientInfo: { name: 'chamvi' },
        });

        connection.on('error', () => this.drop(account.id, connection));
        connection.on('close', () => this.drop(account.id, connection));
        this.connections.set(account.id, connection);

        try {
            await connection.connect();
        } catch (error) {
            this.drop(account.id, connection);

            const failed = (error as { authenticationFailed?: boolean }).authenticationFailed;

            throw requestError(tool, account.id, failed ? 'login failed' : 'cannot connect');
        }

        return connection;
    }

    private drop(id: string, connection: ImapFlow): void {
        if (this.connections.get(id) === connection) {
            this.connections.delete(id);
        }

        try {
            connection.close();
        } catch {
            // already closed
        }
    }

    /** The account's folders with their special use, listed once per client (LIST and LSUB, no STATUS). */
    private async folders(connection: ImapFlow, account: MailAccountNormalized): Promise<ListResponse[]> {
        let listed = this.listed.get(account.id);

        if (!listed) {
            listed = await connection.list();
            this.listed.set(account.id, listed);
        }

        return listed;
    }

    /** Opens `path` read-only (EXAMINE; without `readOnly` imapflow sends SELECT) for `operation`. */
    private async inFolder<T>(connection: ImapFlow, path: string, operation: (uidValidity: string) => Promise<T>): Promise<T> {
        const lock = await connection.getMailboxLock(path, { readOnly: true });

        try {
            const { mailbox } = connection;

            return await operation(mailbox ? String(mailbox.uidValidity) : '');
        } finally {
            lock.release();
        }
    }

    /** Checks the id's folder against the account before opening it, then its UIDVALIDITY. */
    private async inMail<T>(
        connection: ImapFlow,
        account: MailAccountNormalized,
        parts: MailIdParts,
        operation: () => Promise<T>,
    ): Promise<T> {
        const listed = await this.folders(connection, account);

        if (!isAllowedFolder(account, listed, parts.folder)) {
            throw new ValidationError('id names a folder this account does not read: search again.');
        }

        return this.inFolder(connection, parts.folder, async (uidValidity) => {
            if (uidValidity !== parts.uidValidity) {
                throw new ValidationError(MAIL_STALE_ID_MESSAGE);
            }

            return operation();
        });
    }

    private async fetchOne(
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

    /** One folder's newest `limit` matches as summaries, `skip` left out; `total` counts every match. */
    private async searchFolder(
        connection: ImapFlow,
        account: MailAccountNormalized,
        folder: string,
        criteria: SearchObject,
        limit: number,
        skip?: MailIdParts,
    ): Promise<{ found: Found[]; total: number }> {
        return this.inFolder(connection, folder, async (uidValidity) => {
            const matched = (await connection.search(criteria, { uid: true })) || [];
            const uids = matched
                .filter((uid) => !(skip && skip.folder === folder && skip.uid === uid))
                .sort((a, b) => b - a);
            const wanted = uids.slice(0, limit);

            if (wanted.length === 0) {
                return { found: [], total: uids.length };
            }

            const messages = await connection.fetchAll(wanted, SUMMARY_QUERY, { uid: true });
            const snippets = await this.snippets(connection, messages);
            const found = messages.map((message): Found => {
                const envelope = message.envelope ?? {};
                const date = dateOf(message);

                return {
                    summary: {
                        id: encodeMailId({
                            account: account.id,
                            folder,
                            uidValidity,
                            uid: message.uid,
                        }),
                        account: account.id,
                        folder,
                        date: date.toISOString(),
                        from: list(envelope.from),
                        to: list(envelope.to),
                        subject: subjectOf(envelope.subject),
                        snippet: snippets.get(message.uid) ?? '',
                        unread: !message.flags?.has('\\Seen'),
                        hasAttachments: attachmentsOf(message.bodyStructure).length > 0,
                    },
                    time: date.getTime(),
                    ...(envelope.messageId && { messageId: envelope.messageId }),
                };
            });

            return { found, total: uids.length };
        });
    }

    /** The first `MAIL_SNIPPET_BYTES` of each mail's first text part, one fetch per distinct section. */
    private async snippets(connection: ImapFlow, messages: FetchMessageObject[]): Promise<Map<number, string>> {
        const sections = new Map<string, FetchMessageObject[]>();

        for (const message of messages) {
            const part = message.bodyStructure ? textPartOf(message.bodyStructure) : undefined;

            if (part) {
                const section = sectionOf(part);

                sections.set(section, [...(sections.get(section) ?? []), message]);
            }
        }

        const snippets = new Map<number, string>();

        for (const [section, group] of sections) {
            const fetched = await connection.fetchAll(
                group.map((message) => message.uid),
                {
                    uid: true,
                    bodyParts: [{
                        key: section,
                        start: 0,
                        maxLength: MAIL_SNIPPET_BYTES,
                    }],
                },
                { uid: true },
            );

            for (const message of fetched) {
                const data = message.bodyParts?.get(section.toLowerCase());
                const part = group.find((entry) => entry.uid === message.uid)?.bodyStructure;
                const node = part ? textPartOf(part) : undefined;

                if (data && node) {
                    snippets.set(message.uid, snippetOf(decodeText(data, node), node.type === 'text/html'));
                }
            }
        }

        return snippets;
    }

    private merge(found: Found[], limit: number, total: number): MailSearchResult {
        const mails = found
            .sort((a, b) => b.time - a.time)
            .slice(0, limit)
            .map((entry) => entry.summary);

        return { mails, truncated: total > mails.length };
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
