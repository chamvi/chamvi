/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isObject } from 'smob';
import { PACKAGE_MANIFEST } from '../constants.ts';

/** The parsed `package.json` of `dir`, or undefined when it has none or no JSON object. */
export async function readManifest(dir: string): Promise<Record<string, unknown> | undefined> {
    try {
        const manifest: unknown = JSON.parse(await readFile(join(dir, PACKAGE_MANIFEST), 'utf8'));

        return isObject(manifest) ? manifest : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The package root of a resolved entry file: the closest folder above it
 * whose `package.json` names `name` (a nested `package.json` that only sets
 * `type`, e.g. `dist/package.json`, is passed by), or undefined.
 */
export async function findPackageRoot(entry: string, name: string): Promise<{ root: string; manifest: Record<string, unknown> } | undefined> {
    let dir = dirname(entry);

    for (;;) {
        const manifest = await readManifest(dir);

        if (manifest?.name === name) {
            return { root: dir, manifest };
        }

        const parent = dirname(dir);

        if (parent === dir) {
            return undefined;
        }

        dir = parent;
    }
}
