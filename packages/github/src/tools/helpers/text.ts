/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';

/** A user's login, else null (a deleted account). */
export function login(user: unknown): string | null {
    return isObject(user) && typeof user.login === 'string' ? user.login : null;
}

/** A label's name (GitHub sends objects, older payloads strings). */
export function labelName(label: unknown): string {
    if (typeof label === 'string') {
        return label;
    }

    return isObject(label) && typeof label.name === 'string' ? label.name : '';
}

/**
 * Whether `body` ends with `marker` as its own final line, the footer the
 * write tools append (`<text>\n\n<marker>`); trailing whitespace GitHub may
 * add is ignored. A marker quoted inside the text never counts, as for the
 * channel's comments.
 */
export function hasFooterMarker(body: string | null | undefined, marker: string): boolean {
    return typeof body === 'string' && body.trimEnd().endsWith(`\n${marker}`);
}

/** `text` cut after `max` characters. */
export function cut(text: string, max: number): { text: string; truncated: boolean } {
    return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}
