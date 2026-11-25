/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { MailAccount } from '../client/types.ts';

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
