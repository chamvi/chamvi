/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_AGENTS_DIR, HASH_PREFIX_LENGTH, SKILL_PREPARATION_RETRY_MAX_MS } from './constants.ts';

export async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

/**
 * Whether `path` is a directory without a single entry, the shape an
 * unmounted volume leaves behind (its mount point). Any entry, a `.keep`
 * file included, makes it a real, if agent-less, agents dir.
 */
export async function isEmptyDirectory(path: string): Promise<boolean> {
    try {
        return (await readdir(path)).length === 0;
    } catch {
        return false;
    }
}

/**
 * The agents dir a lifecycle loads, absolute: `dir` (CHAMVI_AGENTS_DIR)
 * resolved against `cwd` whether it exists or not (a dir named explicitly
 * must exist, checked by the caller), else `./agents` when that is a
 * directory, else undefined.
 */
export async function resolveAgentsRoot(dir: string | undefined, cwd: string): Promise<string | undefined> {
    if (dir !== undefined) {
        return resolve(cwd, dir);
    }

    const fallback = resolve(cwd, DEFAULT_AGENTS_DIR);

    return await isDirectory(fallback) ? fallback : undefined;
}

/**
 * The delay before the next skill preparation attempt: twice the previous
 * one (the first: twice the poll interval), at most
 * SKILL_PREPARATION_RETRY_MAX_MS unless the poll interval is longer.
 */
export function nextRetryDelay(previous: number | undefined, pollMs: number): number {
    return Math.min((previous ?? pollMs) * 2, Math.max(pollMs, SKILL_PREPARATION_RETRY_MAX_MS));
}

/** A revision as a log line names it: a content hash cut to its prefix, a package marker in full. */
export function formatRevision(revision: string): string {
    return /^[0-9a-f]{64}$/.test(revision) ? revision.slice(0, HASH_PREFIX_LENGTH) : revision;
}
