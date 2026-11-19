/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    extname,
    join,
    relative,
    sep,
} from 'node:path';
import { locateMany } from 'locter';
import { HASH_IGNORE_PATTERNS, HASH_IMPORTABLE_EXTENSIONS } from '../constants.ts';

export function compareCodePoints(a: string, b: string): number {
    if (a === b) {
        return 0;
    }

    return a < b ? -1 : 1;
}

/**
 * Whether the folder hash leaves out `file` (a relative POSIX path): its
 * basename matches HASH_IGNORE_PATTERNS and its extension is none of
 * `importable` (default HASH_IMPORTABLE_EXTENSIONS, what the loader imports).
 */
export function isHashIgnored(file: string, importable: readonly string[] = HASH_IMPORTABLE_EXTENSIONS): boolean {
    const name = file.slice(file.lastIndexOf('/') + 1);
    const extension = extname(name).toLowerCase();

    if (importable.includes(extension)) {
        return false;
    }

    return HASH_IGNORE_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * sha256 (hex) over the files below `dir` that `include` keeps (dot-entries
 * skipped) by relative POSIX path, each as `path + '\0' + bytes + '\0'`.
 */
export async function hashFolder(dir: string, include: (key: string) => boolean): Promise<string> {
    const found = await locateMany('**/*', {
        cwd: dir,
        onlyFiles: true,
        dot: false,
    });

    return hashFiles(dir, found.map((info) => toKey(dir, info.path)).filter(include));
}

/** A path below `dir` as a relative POSIX path. */
export function toKey(dir: string, path: string): string {
    return relative(dir, path).split(sep).join('/');
}

/**
 * sha256 (hex) over the files `keys` (relative POSIX paths below `dir`) in
 * code-point order, each as `key + '\0' + bytes + '\0'`; `read` may supply a
 * file's bytes instead of its content on disk.
 */
export async function hashFiles(
    dir: string,
    keys: readonly string[],
    read: (key: string, path: string) => Promise<Uint8Array | string> = (_key, path) => readFile(path),
): Promise<string> {
    const hash = createHash('sha256');

    for (const key of [...new Set(keys)].sort(compareCodePoints)) {
        hash.update(`${key}\0`);
        hash.update(await read(key, join(dir, ...key.split('/'))));
        hash.update('\0');
    }

    return hash.digest('hex');
}

/**
 * The hash of an agent folder before HASH_IGNORE_PATTERNS existed (every
 * file but dot-entries), or undefined when it equals `hash` (no ignored file):
 * a revision marker at it holds the same content, so a reload moves it
 * without cancelling runs.
 */
export async function formerAgentFolderHash(dir: string, hash: string): Promise<string | undefined> {
    const former = await hashFolder(dir, () => true);

    return former === hash ? undefined : former;
}
