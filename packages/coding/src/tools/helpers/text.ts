/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** `text` cut to at most `max` UTF-16 units, never inside a surrogate pair. */
export function cutText(text: string, max: number): string {
    if (text.length <= max) {
        return text;
    }

    const code = text.charCodeAt(max - 1);
    const end = code >= 0xD800 && code <= 0xDBFF ? max - 1 : max;

    return text.slice(0, end);
}

/** The lines of `text`; a trailing newline ends the last line, it opens none. */
export function linesOf(text: string): string[] {
    if (text.length === 0) {
        return [];
    }

    const lines = text.split('\n');

    if (lines.at(-1) === '') {
        lines.pop();
    }

    return lines;
}

/** The media type of a png, jpeg, gif or webp image by its first bytes, else undefined. */
export function imageTypeOf(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | undefined {
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

    if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 8) === 'PNG\r\n\x1A\n') {
        return 'image/png';
    }

    if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return 'image/jpeg';
    }

    if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) {
        return 'image/gif';
    }

    if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
        return 'image/webp';
    }

    return undefined;
}
