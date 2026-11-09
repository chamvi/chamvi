/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AUTHUP_STORAGE_PREFIX, STORAGE_PREFIX } from './constants.ts';
import type { SessionCookies } from './types.ts';

/** `path` when it is a path of this app (`/...`, never `//host` or a URL), else `fallback`. */
export function safeReturnPath(path: unknown, fallback = '/'): string {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
        return fallback;
    }

    return path;
}

/** Removes every `chamvi.` key (the token, the return path, the authup session). */
export function clearStorage(storage: Storage): void {
    const keys: string[] = [];

    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);

        if (key?.startsWith(STORAGE_PREFIX)) {
            keys.push(key);
        }
    }

    for (const key of keys) {
        storage.removeItem(key);
    }
}

/**
 * Core's permission rule in the browser: `*` alone grants everything, a
 * `*` segment matches one segment, segment counts must match.
 */
export function hasPermission(granted: readonly string[], wanted: string): boolean {
    const want = wanted.split(':');

    return granted.some((grant) => {
        if (grant === '*') {
            return true;
        }

        const have = grant.split(':');

        return have.length === want.length && have.every((segment, i) => segment === '*' || segment === want[i]);
    });
}

/**
 * Cookie functions for `@authup/client-web-kit` over the tab's storage
 * (`chamvi.authup.<name>`, JSON like the kit's cookie library): the tokens
 * never reach `document.cookie`, so no other tab, no browser restart and
 * no request to the server sees them, and sign-out's `clearStorage`
 * removes them. A `null` or `undefined` value unsets.
 *
 * Storage has no cookie paths, so an unset aimed at a path other than
 * `cookiePath` is ignored: a kit that drops the cookies shadowing its
 * pinned path on install (each prefix of the page's path) must not remove
 * the tab's own tokens. `cookiePath` must be given in the kit's normalized
 * form (leading `/`, no trailing `/`), the path its own unsets carry.
 */
export function createSessionCookies(storage: Storage, cookiePath?: string): SessionCookies {
    const keyOf = (key: string) => `${AUTHUP_STORAGE_PREFIX}${key}`;
    const remove = (key: string) => storage.removeItem(keyOf(key));

    return {
        cookieGet(key) {
            const raw = storage.getItem(keyOf(key));

            if (raw === null) {
                return undefined;
            }

            try {
                return JSON.parse(raw);
            } catch {
                return undefined;
            }
        },
        cookieSet(key, value) {
            if (value === null || value === undefined) {
                remove(key);
            } else {
                storage.setItem(keyOf(key), JSON.stringify(value));
            }
        },
        cookieUnset(key, options) {
            if (options?.path !== undefined && options.path !== cookiePath) {
                return;
            }

            remove(key);
        },
    };
}
