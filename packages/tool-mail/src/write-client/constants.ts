/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The SMTP security modes. */
export const MAIL_SMTP_SECURITY = ['tls', 'starttls', 'plain'] as const;

/** The default SMTP port of each security mode. */
export const MAIL_SMTP_PORTS = {
    tls: 465,
    starttls: 587,
    plain: 25,
} as const;
