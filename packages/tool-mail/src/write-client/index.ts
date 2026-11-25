/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export { MAIL_EFFECT_HEADER } from './constants.ts';
export { createMailWriteClient } from './module.ts';
export type {
    IMailWriteClient,
    MailDeleteItem,
    MailDeleteListing,
    MailDeleteResult,
    MailReplyHeaders,
    MailSendRequest,
    MailSendResult,
    MailSmtpNormalized,
    MailSmtpSettings,
    MailWriteAccount,
    MailWriteAccountView,
} from './types.ts';
