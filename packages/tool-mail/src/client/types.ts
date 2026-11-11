/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { MessageStructureObject } from 'imapflow';

/** One IMAP account the mail tools read. */
export type MailAccount = {
    /** The account name the tools use (`^[a-z0-9]+(-[a-z0-9]+)*$`). */
    id: string;
    host: string;
    /** Default 993 with `tls`, else 143. */
    port?: number;
    /** `tls` (default), `starttls`, or `plain` (no encryption, for tests). */
    security?: 'tls' | 'starttls' | 'plain';
    user: string;
    password: string;
    /** The address `mail_accounts` shows (default `user`). */
    address?: string;
    /** The folders searched and read (default: every folder but trash and spam; on Gmail All Mail). */
    folders?: string[];
    /** Gmail extensions: X-GM-RAW search and X-GM-THRID threads (default: `host === 'imap.gmail.com'`). */
    gmail?: boolean;
};

export type MailClientOptions = {
    clock?: IClock;
    /** Milliseconds one call may take (default `MAIL_TIMEOUT_MS`). */
    timeoutMs?: number;
};

/** The parts of a mail id. */
export type MailIdParts = {
    account: string;
    folder: string;
    /** The folder's UIDVALIDITY, as a decimal string. */
    uidValidity: string;
    uid: number;
};

export type MailFolderView = {
    path: string;
    specialUse?: string;
};

export type MailAccountView = {
    account: string;
    address: string;
    folders: MailFolderView[];
};

export type MailSearchInput = {
    account: string;
    /** Full text (Gmail: Gmail search syntax). */
    query?: string;
    folder?: string;
    from?: string;
    to?: string;
    subject?: string;
    since?: Date;
    before?: Date;
    unread?: boolean;
    limit?: number;
};

export type MailSummary = {
    id: string;
    account: string;
    folder: string;
    /** ISO date. */
    date: string;
    from: string;
    to: string;
    subject: string;
    snippet: string;
    unread: boolean;
    hasAttachments: boolean;
};

export type MailSearchResult = {
    /** Newest first. */
    mails: MailSummary[];
    /** More mails matched than `limit`. */
    truncated: boolean;
};

export type MailAttachmentInfo = {
    index: number;
    filename: string | null;
    mediaType: string;
    /** Bytes, estimated from the encoded size. */
    size: number;
};

export type MailMessage = {
    id: string;
    account: string;
    folder: string;
    date: string;
    from: string;
    to: string;
    cc: string;
    subject: string;
    messageId?: string;
    inReplyTo?: string;
    /** The number of References. */
    references: number;
    unread: boolean;
    /** Summaries of the calendar invites. */
    invites: string[];
    body: string;
    offset: number;
    totalChars: number;
    nextOffset?: number;
    attachments: MailAttachmentInfo[];
    /** The mail is above the fetch cap: no body and no invites, the headers and attachments only. */
    truncated: boolean;
};

export type MailAttachmentText = {
    id: string;
    index: number;
    filename: string | null;
    mediaType: string;
    text: string;
    offset: number;
    totalChars: number;
    nextOffset?: number;
};

/** A read-only IMAP client over a set of accounts; the mail tools are thin wrappers around it. */
export interface IMailClient {
    /**
     * `false` only on a client without accounts: each of its calls refuses
     * before anything is read, so the tools do not taint the run. Absent or
     * `true`, every call taints it.
     */
    readonly configured?: boolean;
    accounts(signal?: AbortSignal): Promise<MailAccountView[]>;
    search(input: MailSearchInput, signal?: AbortSignal): Promise<MailSearchResult>;
    get(id: string, offset?: number, signal?: AbortSignal): Promise<MailMessage>;
    attachment(id: string, index: number, offset?: number, signal?: AbortSignal): Promise<MailAttachmentText>;
    thread(id: string, limit?: number, signal?: AbortSignal): Promise<MailSearchResult>;
    /** Logs out of every account. */
    close(): Promise<void>;
}

/** An attachment of a mail: its BODYSTRUCTURE node and what `mail_get` shows of it. */
export type StructureAttachment = {
    node: MessageStructureObject;
    info: MailAttachmentInfo;
};
