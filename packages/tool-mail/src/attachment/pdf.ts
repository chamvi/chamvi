/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { getDocumentProxy } from 'unpdf';
import { MAIL_PDF_MAX_PAGES } from '../text/constants.ts';

/**
 * The text of the first `MAIL_PDF_MAX_PAGES` pages, one entry per page joined by a line break.
 * unpdf's `extractText` reads every page at once, so the pages are read one by one here; the document gets a
 * copy of the bytes (pdf.js transfers, and so detaches, its input).
 */
export async function extractPdfText(data: Uint8Array, signal?: AbortSignal): Promise<string> {
    const pdf = await getDocumentProxy(data.slice());

    try {
        const pages: string[] = [];
        const count = Math.min(MAIL_PDF_MAX_PAGES, pdf.numPages);

        for (let number = 1; number <= count; number++) {
            signal?.throwIfAborted();

            const page = await pdf.getPage(number);
            const content = await page.getTextContent();
            const parts: string[] = [];

            for (const item of content.items) {
                if ('str' in item) {
                    parts.push(item.str + (item.hasEOL ? '\n' : ''));
                }
            }

            pages.push(parts.join(''));
        }

        return pages.join('\n');
    } finally {
        await pdf.loadingTask.destroy();
    }
}
