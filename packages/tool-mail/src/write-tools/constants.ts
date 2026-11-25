/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The most recipients of one mail, in `to`, `cc` and `bcc` together. */
export const MAIL_SEND_MAX_RECIPIENTS = 50;

/** The longest subject `mail_send` takes. */
export const MAIL_SEND_SUBJECT_MAX_CHARS = 500;

/** The longest text `mail_send` takes. */
export const MAIL_SEND_TEXT_MAX_CHARS = 100_000;

/** A bare address: no display name, no comment, no list, nothing a header could be built from. */
export const MAIL_ADDRESS_PATTERN = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/;

/** Where an approval cuts the answered mail's From and subject (internal). */
export const MAIL_APPROVAL_FIELD_MAX_CHARS = 200;
