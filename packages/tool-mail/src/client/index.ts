/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export {
    MAIL_SEARCH_DEFAULT_LIMIT,
    MAIL_SEARCH_MAX_LIMIT,
    MAIL_THREAD_MAX_REFERENCES,
    MAIL_TIMEOUT_MS,
} from './constants.ts';
export { encodeMailId, parseMailId } from './ids.ts';
export { createMailClient } from './module.ts';
export type {
    IMailClient,
    MailAccount,
    MailAccountView,
    MailAttachmentInfo,
    MailAttachmentText,
    MailClientOptions,
    MailFolderView,
    MailIdParts,
    MailMessage,
    MailSearchInput,
    MailSearchResult,
    MailSummary,
} from './types.ts';
