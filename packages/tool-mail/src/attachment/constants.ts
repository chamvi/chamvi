/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The text of an attachment whose extraction failed; the cause is never shown, it may carry content. */
export const EXTRACTION_FAILED_TEXT = '(text extraction failed)';

/** Media types of calendar data: summarised as invites, never extracted as attachment text. */
export const CALENDAR_MEDIA_TYPES: ReadonlySet<string> = new Set([
    'text/calendar',
    'application/ics',
]);

/** File names read as text besides `text/*` media types. */
export const TEXT_EXTENSIONS = /\.(txt|csv|md)$/;

/** OOXML documents, by file name. */
export const OOXML_EXTENSIONS = /\.(docx|xlsx|pptx)$/;

/** OOXML documents, by media type. */
export const OOXML_MEDIA_TYPES: ReadonlySet<string> = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** The OOXML parts that carry the text: the document, the shared strings and worksheets, the slides. */
export const OOXML_TEXT_PARTS = /^(word\/document|xl\/sharedStrings|xl\/worksheets\/sheet\d+|ppt\/slides\/slide\d+)\.xml$/;
