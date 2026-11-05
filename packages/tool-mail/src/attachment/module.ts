/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MAIL_ATTACHMENT_MAX_CHARS } from '../text/constants.ts';
import {
    CALENDAR_MEDIA_TYPES,
    EXTRACTION_FAILED_TEXT,
    OOXML_EXTENSIONS,
    OOXML_MEDIA_TYPES,
    TEXT_EXTENSIONS,
} from './constants.ts';
import { extractOoxmlText } from './ooxml.ts';
import { extractPdfText } from './pdf.ts';

async function extract(
    data: Uint8Array,
    mediaType: string,
    name: string,
    signal?: AbortSignal,
): Promise<string> {
    if (CALENDAR_MEDIA_TYPES.has(mediaType) || name.endsWith('.ics')) {
        // summarised as an invite instead
        return '';
    }

    if (mediaType === 'application/pdf' || name.endsWith('.pdf')) {
        return extractPdfText(data, signal);
    }

    if (OOXML_MEDIA_TYPES.has(mediaType) || OOXML_EXTENSIONS.test(name)) {
        return extractOoxmlText(data);
    }

    if (mediaType.startsWith('text/') || TEXT_EXTENSIONS.test(name)) {
        return new TextDecoder().decode(data.subarray(0, MAIL_ATTACHMENT_MAX_CHARS * 4));
    }

    return '';
}

/**
 * The text of an attachment: PDF (the first pages), docx/xlsx/pptx, `text/*` and `.txt`/`.csv`/`.md`.
 * Calendar data and every other type give `''`. Never throws: a failing extraction (a broken file, an aborted
 * signal) gives `EXTRACTION_FAILED_TEXT` without the cause, which may quote the content.
 */
export async function extractAttachmentText(
    data: Uint8Array,
    mediaType: string,
    filename: string | null,
    signal?: AbortSignal,
): Promise<string> {
    try {
        signal?.throwIfAborted();

        return await extract(data, mediaType.toLowerCase(), (filename ?? '').toLowerCase(), signal);
    } catch {
        return EXTRACTION_FAILED_TEXT;
    }
}
