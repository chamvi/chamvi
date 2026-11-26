/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type EntryKind = 'source' | 'built';

export type ResolveEntryInput = {
    cwd: string;
    /** `--entry`, relative to `cwd` or absolute; citty gives `''` for a bare `--entry` and `false` for `--no-entry`. */
    entry?: string | boolean;
    kind: EntryKind;
};
