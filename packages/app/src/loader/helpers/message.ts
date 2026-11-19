/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { realpathSync } from 'node:fs';
import { sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The message of a thrown value, with its cause's message when that adds to it. */
export function messageOf(error: unknown): string {
    const message = Error.isError(error) ? error.message : String(error);
    const cause = Error.isError(error) ? error.cause : undefined;

    if (Error.isError(cause) && cause.message && !message.includes(cause.message)) {
        return `${message} (${cause.message})`;
    }

    return message;
}

/** `message` with every spelling of `base` (path, real path, file URL) cut, so it names paths relative to it. */
export function relativize(message: string, base: string): string {
    const prefixes = new Set<string>([base]);

    try {
        prefixes.add(realpathSync(base));
    } catch {
        // a missing base has no real path
    }

    for (const prefix of [...prefixes]) {
        prefixes.add(pathToFileURL(prefix).href);
    }

    let out = message;

    // the longest first, so a URL is not cut down to its path part
    for (const prefix of [...prefixes].sort((a, b) => b.length - a.length)) {
        out = out.split(`${prefix}${prefix.startsWith('file:') ? '/' : sep}`).join('');
        out = out.split(prefix).join('.');
    }

    return out;
}
