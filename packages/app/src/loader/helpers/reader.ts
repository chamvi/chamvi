/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleReader, resolveModuleSync } from 'locter';
import { isObject } from 'smob';
import { PINNED_PACKAGE_SCOPES } from '../constants.ts';

let moduleReader: ModuleReader | undefined;

/**
 * The default reader of `agent.ts`: one module reader that pins the app's
 * packages (`createPackageAliases`), created on first use.
 */
export function readFreshModule(path: string): Promise<unknown> {
    moduleReader ??= createModuleReader(import.meta.url);

    return moduleReader.read(path);
}

/**
 * A transpiling module reader without module or transpile cache (writes
 * nothing into `node_modules`): every read evaluates a file and its
 * `.ts`/`.mts` imports fresh, packages load natively (one instance), and bare
 * `@chamvi/*`, `ai` and `@ai-sdk/*` specifiers resolve to the copies `from`
 * resolves, wherever the importing file lives.
 */
export function createModuleReader(from: string): ModuleReader {
    return new ModuleReader({
        strategy: 'transpile',
        cache: false,
        transpileCache: false,
        alias: createPackageAliases(from),
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
                // not resolvable with the import conditions (e.g. a require-only subpath): left to the reader
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
