/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import type { Jiti } from 'jiti';
import { resolveModuleSync } from 'locter';
import { isObject } from 'smob';
import { PINNED_PACKAGE_SCOPES } from '../constants.ts';

let moduleJiti: Jiti | undefined;

/**
 * The default reader of `agent.ts`: `readModule` on one jiti that pins the
 * app's packages (`createPackageAliases`), created on first use.
 */
export function readFreshModule(path: string): Promise<unknown> {
    moduleJiti ??= createModuleJiti(import.meta.url);

    return readModule(moduleJiti, path);
}

/**
 * A jiti without module or fs cache (writes nothing into `node_modules`)
 * whose bare `@chamvi/*`, `ai` and `@ai-sdk/*` specifiers resolve to the
 * copies `from` resolves, wherever the importing file lives.
 */
export function createModuleJiti(from: string): Jiti {
    return createJiti(from, {
        moduleCache: false,
        fsCache: false,
        interopDefault: true,
        alias: createPackageAliases(from),
    });
}

/**
 * Evaluates a module file fresh on every call (transpiled, never from Node's
 * module cache). Its relative `.ts`/`.mts` imports are transpiled fresh too;
 * packages load natively (one instance).
 */
export async function readModule(jiti: Jiti, path: string): Promise<unknown> {
    const source = await readFile(path, 'utf8');

    return jiti.evalModule(source, {
        filename: path,
        async: true,
        forceTranspile: true,
    });
}

/**
 * Alias entries (`specifier -> absolute file`) for every package named
 * `@chamvi/*`, `ai` or `@ai-sdk/*` that `from` can resolve (the closest
 * `node_modules` first), one per exported subpath without a wildcard,
 * resolved with the ESM conditions from `from`.
 */
export function createPackageAliases(from: string): Record<string, string> {
    const fromPath = from.startsWith('file:') ? fileURLToPath(from) : from;
    const packages = new Map<string, string>();

    for (const modules of nodeModulesPaths(dirname(fromPath))) {
        for (const name of listPinnedPackages(modules)) {
            if (!packages.has(name)) {
                packages.set(name, join(modules, name));
            }
        }
    }

    const aliases: Record<string, string> = {};

    for (const [name, dir] of packages) {
        for (const subpath of exportedSubpaths(dir)) {
            const specifier = subpath === '.' ? name : `${name}${subpath.slice(1)}`;

            try {
                aliases[specifier] = resolveModuleSync(specifier, { parentURL: fromPath });
            } catch {
                // not resolvable with the import conditions (e.g. a require-only subpath): left to jiti
            }
        }
    }

    return aliases;
}

function nodeModulesPaths(start: string): string[] {
    const paths: string[] = [];
    let dir = start;

    for (;;) {
        if (basename(dir) !== 'node_modules') {
            paths.push(join(dir, 'node_modules'));
        }

        const parent = dirname(dir);

        if (parent === dir) {
            return paths;
        }

        dir = parent;
    }
}

function listPinnedPackages(modules: string): string[] {
    const names: string[] = [];

    if (isDirectorySync(join(modules, 'ai'))) {
        names.push('ai');
    }

    for (const scope of PINNED_PACKAGE_SCOPES) {
        let entries: string[];

        try {
            entries = readdirSync(join(modules, scope));
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (!entry.startsWith('.')) {
                names.push(`${scope}/${entry}`);
            }
        }
    }

    return names;
}

/** The subpaths a package exports (`.` and `./x`), wildcards and `./package.json` left out. */
function exportedSubpaths(dir: string): string[] {
    let manifest: unknown;

    try {
        manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch {
        return [];
    }

    if (!isObject(manifest)) {
        return [];
    }

    const { exports } = manifest;

    if (!isObject(exports)) {
        return ['.'];
    }

    const keys = Object.keys(exports);

    const hasNoSubpathExports = keys.every((key) => !key.startsWith('.'));

    if (hasNoSubpathExports) {
        return ['.'];
    }

    return keys.filter((key) => key.startsWith('.') && !key.includes('*') && key !== './package.json');
}

function isDirectorySync(path: string): boolean {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
}
