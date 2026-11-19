/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { isObject } from 'smob';
import { JSON_BODY_MAX_LENGTH } from '../constants.ts';
import type { DetailLine } from '../types.ts';

/** A detail reads as a diff when a line starts with `@@ ` or a `--- ` line is followed by a `+++ ` line. */
export function isDiffDetail(detail: string): boolean {
    const lines = detail.split('\n');

    return lines.some((line, index) => line.startsWith('@@ ') ||
        (line.startsWith('--- ') && (lines[index + 1] ?? '').startsWith('+++ ')));
}

/** The lines of an option's detail, each marked add, del or hunk when the detail is a diff. */
export function detailLines(detail: string): DetailLine[] {
    const lines = detail.split('\n');

    if (!isDiffDetail(detail)) {
        return lines.map((text) => ({ text }));
    }

    return lines.map((text) => {
        if (text.startsWith('@@')) {
            return { text, kind: 'hunk' as const };
        }

        if (text.startsWith('+') && !text.startsWith('+++')) {
            return { text, kind: 'add' as const };
        }

        if (text.startsWith('-') && !text.startsWith('---')) {
            return { text, kind: 'del' as const };
        }

        return { text };
    });
}

/**
 * The parsed body when it is a JSON object or array (a trust approval's
 * `{ tool, input, taint }`), shown as a JSON block; else undefined (text).
 */
export function jsonBody(body: string): unknown {
    const text = body.trim();

    // a large body would render one element per token: it stays text
    if (text.length > JSON_BODY_MAX_LENGTH || (!text.startsWith('{') && !text.startsWith('['))) {
        return undefined;
    }

    try {
        const value: unknown = JSON.parse(text);

        return isObject(value) || Array.isArray(value) ? value : undefined;
    } catch {
        return undefined;
    }
}
