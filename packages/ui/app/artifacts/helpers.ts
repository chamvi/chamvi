/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunWire } from '../api/types.ts';
import { INLINE_IMAGE_TYPES } from './constants.ts';
import type { ObjectUrls } from './types.ts';

/** Whether a media type is shown inline (raster images only, exact match). */
export function isInlineImage(mediaType: string): boolean {
    return INLINE_IMAGE_TYPES.includes(mediaType);
}

/** Every artifact id a wait point names, request first, then per option, once each. */
export function approvalArtifactIds(waiting: Pick<NonNullable<RunWire['waiting']>, 'artifacts' | 'options'> | undefined): string[] {
    const ids = new Set<string>(waiting?.artifacts ?? []);

    for (const option of waiting?.options ?? []) {
        for (const id of option.artifacts ?? []) {
            ids.add(id);
        }
    }

    return [...ids];
}

/** The browser's object URLs. */
export const browserObjectUrls: ObjectUrls = {
    create: (blob) => URL.createObjectURL(blob),
    revoke: (url) => URL.revokeObjectURL(url),
};

/**
 * Saves a blob as a file through a temporary `<a download>`: the browser
 * downloads it and never renders it in the UI origin (no new tab).
 */
export function saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    // the download has started from the URL by now; release it on the next task
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
