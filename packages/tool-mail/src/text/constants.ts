/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Characters of a mail body returned per page. */
export const MAIL_BODY_MAX_CHARS = 50_000;

/** Characters of extracted attachment text returned per page. */
export const MAIL_ATTACHMENT_MAX_CHARS = 20_000;

/** Pages of a PDF attachment read for text. */
export const MAIL_PDF_MAX_PAGES = 50;

/** OOXML parts (docx, xlsx, pptx) declaring more uncompressed bytes than this are skipped. */
export const MAIL_ZIP_PART_MAX_BYTES = 10 * 1024 * 1024;

/** Uncompressed bytes of all OOXML parts of one attachment together, declared and actually inflated. */
export const MAIL_ZIP_TOTAL_MAX_BYTES = 20 * 1024 * 1024;

/** Slides of a pptx, and worksheets of an xlsx, read for text. */
export const MAIL_OOXML_MAX_SLIDES = 200;

/** Characters of a subject returned. */
export const MAIL_SUBJECT_MAX_CHARS = 1000;

/** Characters of an address list (`from`, `to`, `cc`) returned. */
export const MAIL_ADDRESSES_MAX_CHARS = 2000;

/** Characters of each field value of an invite summary. */
export const MAIL_INVITE_FIELD_MAX_CHARS = 500;

/** Calendar parts of one mail summarised as invites at most. */
export const MAIL_INVITES_MAX = 10;

/** HTML is cut at this many characters before it is stripped, so hostile HTML stays bounded. */
export const MAIL_HTML_MAX_CHARS = 1_000_000;

/** Raw mails above this size are not fetched: the headers and the attachment list are returned instead. */
export const MAIL_FETCH_MAX_BYTES = 25 * 1024 * 1024;
