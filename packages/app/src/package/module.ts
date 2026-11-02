/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFile, realpath  } from 'node:fs/promises';
import {
    isAbsolute,
    join,
    relative,
    sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Agent } from '@chamvi/core';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { createJiti } from 'jiti';
import { locateMany } from 'locter';
import { isObject } from 'smob';
import {
    defaultExportOf,
    hashFiles,
    isDeclaredAgent,
    isFile,
    isHashIgnored,
    messageOf,
    rebuildAgent,
    relativize,
    toKey,
} from '../loader/helpers.ts';
import {
    PACKAGE_HASH_IGNORE,
    PACKAGE_HASH_IMPORTABLE_EXTENSIONS,
    PACKAGE_MANIFEST,
    PACKAGE_TEST_DIR,
    REVISION_MAX_LENGTH,
} from './constants.ts';
import {
    devMarker,
    findPackageRoot,
    packageNameOf,
    readManifest,
} from './helpers.ts';
import { pinPackageImports } from './hooks.ts';
import type { HashAgentPackageOptions, LoadAgentPackageOptions, LoadedPackage } from './types.ts';

/**
 * Resolves the agent package `spec` from `options.cwd` (ESM conditions, the
 * real path of a symlinked workspace package), finds its root (the closest
 * `package.json` naming the package), reads its `version`, pins the app's
 * `@chamvi/*`, `ai` and `@ai-sdk/*` for its imports and imports its entry.
 * The default export is an agent or a non-empty array of agents, checked
 * structurally (another `@chamvi/core` copy's agents pass) and rebuilt
 * through this copy's defineAgent(). The revision is `<name>@<version>`, in
 * dev `<name>@<version>+<12 hex of hashAgentPackage(root, { entry })>`. Every failure
 * is an InvalidAgentDefinitionError naming the specifier, paths relative to
 * `cwd`.
 */
export async function loadAgentPackage(spec: string, options: LoadAgentPackageOptions): Promise<LoadedPackage> {
    const { cwd } = options;

    try {
        return await loadOnce(spec, options);
    } catch (error) {
        const message = relativize(messageOf(error), cwd);

        throw new InvalidAgentDefinitionError(message.startsWith(`${spec}: `) ? message : `${spec}: ${message}`);
    }
}

async function loadOnce(spec: string, options: LoadAgentPackageOptions): Promise<LoadedPackage> {
    const { cwd } = options;
    const name = packageNameOf(spec);
    const entry = await resolveEntry(spec, cwd);
    const found = await findPackageRoot(entry, name);

    if (found === undefined) {
        throw new InvalidAgentDefinitionError(`${spec}: no package.json above its entry names the package ${name}.`);
    }

    const { root, manifest } = found;
    const { version } = manifest;

    if (typeof version !== 'string' || version.length === 0) {
        throw new InvalidAgentDefinitionError(`${spec}: the package.json of ${name} has no version; a package agent's revision is its version.`);
    }

    const versionMarker = `${name}@${version}`;
    const revision = options.dev ? devMarker(versionMarker, await hashAgentPackage(root, { entry })) : versionMarker;

    if (revision.length > REVISION_MAX_LENGTH) {
        throw new InvalidAgentDefinitionError(`${spec}: the revision ${revision} is longer than ${REVISION_MAX_LENGTH} characters.`);
    }

    let mod: unknown;

    try {
        if (options.importer) {
            mod = await options.importer(pathToFileURL(entry).href);
        } else {
            pinPackageImports(root);
            mod = await import(/* @vite-ignore */ pathToFileURL(entry).href);
        }
    } catch (error) {
        throw new InvalidAgentDefinitionError(`${spec}: ${importMessage(error)}`);
    }

    return {
        spec,
        name,
        version,
        root,
        revision,
        ...(options.dev && { formerRevision: versionMarker }),
        agents: buildAgents(spec, mod),
    };
}

async function resolveEntry(spec: string, cwd: string): Promise<string> {
    const resolver = createJiti(join(cwd, PACKAGE_MANIFEST), { moduleCache: false, fsCache: false });
    let resolved: string;

    try {
        resolved = resolver.esmResolve(spec, { parentURL: pathToFileURL(`${cwd}${sep}`).href });
    } catch {
        throw new InvalidAgentDefinitionError(`${spec}: not found from the app's directory; add it to the app's dependencies.`);
    }

    return realpath(resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved);
}

function importMessage(error: unknown): string {
    const message = messageOf(error);
    const { code } = (isObject(error) ? error : {}) as { code?: unknown };

    if (code === 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING') {
        return `${message} Build the package to JavaScript, or link it from a workspace.`;
    }

    return message;
}

function buildAgents(spec: string, mod: unknown): Agent[] {
    const declared = defaultExportOf(mod, spec);
    const list = Array.isArray(declared) ? declared : [declared];
    const shapeError = new InvalidAgentDefinitionError(
        `${spec}: the default export must be defineAgent(...)'s result or a non-empty array of them.`,
    );

    if (list.length === 0) {
        throw shapeError;
    }

    const names = new Set<string>();

    return list.map((item: unknown) => {
        if (!isDeclaredAgent(item)) {
            throw shapeError;
        }

        if (names.has(item.name)) {
            throw new InvalidAgentDefinitionError(`${spec}: exports the agent "${item.name}" twice.`);
        }

        names.add(item.name);

        return rebuildAgent(item);
    });
}

/**
 * The content hash of an agent package: sha256 (hex, `hashFiles` framing)
 * over the files npm would publish. With a `files` array: its entries (a
 * folder with everything below it, `!` entries left out), `package.json` and
 * `main`; without one: every file but a top-level `test/` folder. With
 * `options.entry`, also the entry's top-level folder (or the entry itself at
 * the root), so a linked package exporting its source outside `files` is
 * hashed by the code that runs. Always left out: `node_modules`, dot-entries
 * and the docs and editor leftovers of HASH_IGNORE_PATTERNS (a JavaScript
 * file counts whatever its name). `package.json` counts as its JSON without
 * `version`, so a release that only bumps the version keeps the hash.
 */
export async function hashAgentPackage(root: string, options: HashAgentPackageOptions = {}): Promise<string> {
    const manifest = await readManifest(root);
    const { files, main } = manifest ?? {};
    const keys = new Set<string>();
    const include: string[] = [];
    const exclude: string[] = [];

    const hasFiles = Array.isArray(files) && files.every((entry) => typeof entry === 'string');

    if (hasFiles) {
        for (const entry of files as string[]) {
            const negated = entry.startsWith('!');
            const pattern = normalizePattern(negated ? entry.slice(1) : entry);

            if (pattern.length > 0) {
                (negated ? exclude : include).push(...await patternsOf(root, pattern));
            }
        }

        if (typeof main === 'string' && await isFile(join(root, main))) {
            keys.add(normalizePattern(main));
        }
    } else {
        include.push('**/*');
        exclude.push(`${PACKAGE_TEST_DIR}/**`);
    }

    const entryTop = options.entry !== undefined ? topLevelOf(root, options.entry) : undefined;

    if (entryTop !== undefined) {
        include.push(...await patternsOf(root, entryTop));
    }

    if (include.length > 0) {
        const found = await locateMany(include, {
            cwd: root,
            onlyFiles: true,
            dot: false,
            ignore: [...PACKAGE_HASH_IGNORE, ...exclude],
        });

        for (const info of found) {
            keys.add(toKey(root, info.path));
        }
    }

    if (manifest !== undefined) {
        keys.add(PACKAGE_MANIFEST);
    }

    const counted = [...keys].filter((key) => key.split('/').every((segment) => !(segment.startsWith('.') || segment === 'node_modules')) &&
        !isHashIgnored(key, PACKAGE_HASH_IMPORTABLE_EXTENSIONS));

    return hashFiles(root, counted, (key, path) => {
        if (key === PACKAGE_MANIFEST && manifest !== undefined) {
            const rest = { ...manifest };

            delete rest.version;

            return Promise.resolve(JSON.stringify(rest));
        }

        return readFile(path);
    });
}

/** A `files` entry as glob patterns: a file itself, anything else (a folder, a glob) with everything below it. */
async function patternsOf(root: string, pattern: string): Promise<string[]> {
    return await isFile(join(root, pattern)) ? [pattern] : [pattern, `${pattern}/**`];
}

/** The first path segment of `file` below `root` (POSIX), or undefined outside it. */
function topLevelOf(root: string, file: string): string | undefined {
    const rel = relative(root, file);

    if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) {
        return undefined;
    }

    return rel.split(sep)[0];
}

/** A `files` entry or `main` as a pattern relative to the root: a leading `./` and trailing `/` dropped. */
function normalizePattern(entry: string): string {
    return entry.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
}
