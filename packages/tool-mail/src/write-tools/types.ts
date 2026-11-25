/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock, ModelRef, ToolContext } from '@chamvi/core';
import type { IMailWriteClient, MailWriteAccount } from '../write-client/types.ts';

export type MailWriteToolsOptions = {
    /** The accounts the tools write through a client of their own. */
    accounts?: MailWriteAccount[];
    /** A client to use (e.g. one closed by its owner); takes precedence over `accounts`. */
    client?: IMailWriteClient;
    /** For the client built from `accounts` and the delete classifier's timeout. */
    clock?: IClock;
    /** For the client built from `accounts` and the delete classifier (default `MAIL_TIMEOUT_MS`). */
    timeoutMs?: number;
    /** The model that decides whether a delete is routine; default the agent's model. */
    classifier?: { model?: ModelRef };
    /** `mail_delete`'s own limit (default 20 mails an hour in bucket `deletes`); false: none. */
    deleteLimit?: MailDeleteLimitSettings | false;
};

/** The input of `mail_send`: bare addresses only. */
export type MailSendInput = {
    account: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text: string;
    /** A mail id of the read tools: the mail this one answers. */
    inReplyTo?: string;
};

/** The input of `mail_delete`: 1 to `MAIL_DELETE_MAX_IDS` mail ids of one account. */
export type MailDeleteInput = {
    ids: string[];
};

/** The settings of `mail_delete`'s own limit, each with its default. */
export type MailDeleteLimitSettings = {
    /** The most mails moved per window (default `MAIL_DELETE_LIMIT_MAX`). */
    max?: number;
    /** The window in milliseconds (default `MAIL_DELETE_LIMIT_WINDOW_MS`). */
    windowMs?: number;
    /** The bucket the calls count in (default `MAIL_DELETE_LIMIT_BUCKET`). */
    bucket?: string;
};

/** What a delete's limit approval showed (internal): the ids its listing covered. */
export type MailDeleteShown = {
    ids: string[];
};

/** The write client a tool call uses: the given one, or the one provided on the engine. */
export type MailWriteClientSource = (context: ToolContext) => IMailWriteClient;

/** What `mail_delete` takes besides its client (internal): the classifier's model and its timeout on `clock`. */
export type MailDeleteToolOptions = {
    clock: IClock;
    timeoutMs: number;
    classifier?: { model?: ModelRef };
    limit?: MailDeleteLimitSettings | false;
};
