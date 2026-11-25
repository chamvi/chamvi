/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MailAccount } from '../client/types.ts';
import type { MailAccountNormalized } from '../options/types.ts';

/** How an account sends: its IMAP user and password log in to SMTP too. */
export type MailSmtpSettings = {
    host: string;
    /** Default 465 with `tls`, 587 with `starttls`, 25 with `plain`. */
    port?: number;
    /** `tls` (default), `starttls`, or `plain` (no encryption, for tests). */
    security?: 'tls' | 'starttls' | 'plain';
};

/** An account of the write tools: a read account that may also send. */
export type MailWriteAccount = MailAccount & { smtp?: MailSmtpSettings };

/** The SMTP settings checked, with their defaults. */
export type MailSmtpNormalized = {
    host: string;
    port: number;
    security: 'tls' | 'starttls' | 'plain';
};

/** An account of the write client checked, with its defaults. */
export type MailWriteAccountNormalized = MailAccountNormalized & { smtp?: MailSmtpNormalized };

/** An account that sends. */
export type MailSmtpAccount = MailAccountNormalized & { smtp: MailSmtpNormalized };

/** What the write tools show of an account. */
export type MailWriteAccountView = {
    id: string;
    address: string;
    gmail: boolean;
    /** Whether the account has SMTP settings and can send. */
    smtp: boolean;
};

/** The headers a reply takes from the mail it answers. */
export type MailReplyHeaders = {
    /** The answered mail's Message-ID (`In-Reply-To`). */
    messageId: string;
    /** Its last `MAIL_THREAD_MAX_REFERENCES` References plus its Message-ID. */
    references: string[];
    /** Its From, for the approval. */
    from: string;
    /** Its subject, for the approval. */
    subject: string;
};

/** One mail to send: bare addresses, checked by the tool. */
export type MailSendRequest = {
    account: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text: string;
    reply?: MailReplyHeaders;
    /** The Message-ID header, `<...@domain>`. */
    messageId: string;
    /** The X-Chamvi-Effect header value (`effectMarker(key)`). */
    marker: string;
};

export type MailSendResult = {
    account: string;
    messageId: string;
    /** Whether a copy is in the account's Sent folder. */
    filed: boolean;
    /** The request's recipients the SMTP server refused (the mail went to the others). */
    refused: string[];
};

/** A mail a delete would move, as its approval shows it. */
export type MailDeleteItem = {
    id: string;
    folder: string;
    /** The From addresses, cut at `MAIL_ADDRESSES_MAX_CHARS`. */
    from: string;
    /** Cut at `MAIL_SUBJECT_MAX_CHARS`. */
    subject: string;
    /** ISO date: the Date header, else INTERNALDATE. */
    date: string;
};

/** The mails of a delete, in input order. */
export type MailDeleteListing = {
    account: string;
    /** The path of the account's `\Trash` folder. */
    trash: string;
    mails: MailDeleteItem[];
    /** Ids whose mail is gone or whose folder changed UIDVALIDITY. */
    missing: string[];
};

export type MailDeleteResult = {
    account: string;
    trash: string;
    /** Ids moved to the trash, in input order. */
    moved: string[];
    /** Ids whose mail was gone (already moved, deleted elsewhere) or whose folder changed UIDVALIDITY. */
    missing: string[];
};

/** The SMTP envelope of a send. */
export type MailEnvelope = {
    from: string;
    to: string[];
};

/** Sends mail over SMTP and files it in Sent; separate from the read-only `IMailClient`. */
export interface IMailWriteClient {
    /**
     * `false` only on a client without accounts: each of its calls refuses
     * before anything is sent or read.
     */
    readonly configured?: boolean;
    /** The account `id`, undefined when there is none. */
    account(id: string): MailWriteAccountView | undefined;
    /**
     * Sends `request` over SMTP (the transmitted copy without a Bcc header) and, on a generic account, APPENDs
     * the copy with its Bcc header to the `\Sent` folder. Nothing throws after the SMTP accept: a failed filing
     * is `filed: false`.
     */
    send(request: MailSendRequest, signal?: AbortSignal): Promise<MailSendResult>;
    /**
     * The sent mail of `lookup` in the account's `\Sent` folder (generic: by X-Chamvi-Effect or Message-ID, for
     * servers that do not index custom headers; Gmail: by Message-ID); undefined when absent, when the account
     * cannot send or has no `\Sent`. A failed search throws.
     */
    findSent(account: string, lookup: { key: string; messageId: string }, signal?: AbortSignal): Promise<MailSendResult | undefined>;
    /**
     * The mails `ids` name (EXAMINE only), deduplicated, in input order. A ValidationError, before any folder is
     * opened, for ids of two accounts, an unknown account, an unlisted folder or a folder that is the trash;
     * `move not supported` without a native MOVE (the capability or an active IMAP4rev2 session), `no trash folder` without a `\Trash` folder.
     */
    describe(ids: string[], signal?: AbortSignal): Promise<MailDeleteListing>;
    /**
     * Moves the mails `ids` to the account's `\Trash` folder (`UID MOVE`, one per folder, each right after its
     * SELECT), with `describe`'s checks. A failed move throws; folders moved before stay moved, and a retry
     * reports their ids as missing.
     */
    trash(ids: string[], signal?: AbortSignal): Promise<MailDeleteResult>;
    /** The headers a reply to the mail `id` takes (EXAMINE, never SELECT). */
    replyHeaders(id: string, signal?: AbortSignal): Promise<MailReplyHeaders>;
    /** Logs out of every account. */
    close(): Promise<void>;
}
