/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFile, realpath  } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Agent, AgentDefinition } from '@chamvi/core';
import { InvalidAgentDefinitionError, defineAgent } from '@chamvi/core';
import { createJiti } from 'jiti';
import { locateMany } from 'locter';
import { isObject } from 'smob';
import {
    hashFiles,
    isFile,
    isHashIgnored,
    messageOf,
    relativize,
    toKey,
} from '../loader/helpers.ts';
import {
    PACKAGE_HASH_IGNORE,
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
import type { LoadAgentPackageOptions, LoadedPackage } from './types.ts';

/**
 * Resolves the agent package `spec` from `options.cwd` (ESM conditions, the
 * real path of a symlinked workspace package), finds its root (the closest
 * `package.json` naming the package), reads its `version`, pins the app's
 * `@chamvi/*`, `ai` and `@ai-sdk/*` for its imports and imports its entry.
 * The default export is an agent or a non-empty array of agents, checked
 * structurally (another `@chamvi/core` copy's agents pass) and rebuilt
 * through this copy's defineAgent(). The revision is `<name>@<version>`, in
 * dev `<name>@<version>+<12 hex of hashAgentPackage(root)>`. Every failure
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
    const revision = options.dev ? devMarker(versionMarker, await hashAgentPackage(root)) : versionMarker;

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
    if (!(isObject(mod) || typeof mod === 'function') || !('default' in mod)) {
        throw new InvalidAgentDefinitionError(`${spec}: has no default export.`);
    }

    const declared = (mod as { default: unknown }).default;
    const list = Array.isArray(declared) ? declared : [declared];
    const shapeError = new InvalidAgentDefinitionError(
        `${spec}: the default export must be defineAgent(...)'s result or a non-empty array of them.`,
    );

    if (list.length === 0) {
        throw shapeError;
    }

    const names = new Set<string>();

    return list.map((item: unknown) => {
        // structural, so an agent built by another @chamvi/core copy passes too
        if (!isObject(item) || typeof item.name !== 'string' || !isObject(item.definition)) {
            throw shapeError;
        }

        if (names.has(item.name)) {
            throw new InvalidAgentDefinitionError(`${spec}: exports the agent "${item.name}" twice.`);
        }

        names.add(item.name);

        // through this copy of defineAgent, so its checks and budget defaults apply
        return defineAgent({ ...item.definition, name: item.name } as AgentDefinition);
    });
}

/**
 * The content hash of an agent package: sha256 (hex, `hashFiles` framing)
 * over the files npm would publish. With a `files` array: its entries (a
 * folder with everything below it, `!` entries left out), `package.json` and
 * `main`; without one: every file but a top-level `test/` folder. Always
 * left out: `node_modules`, dot-entries and the docs and editor leftovers
 * of HASH_IGNORE_PATTERNS. `package.json` counts as its JSON without
 * `version`, so a release that only bumps the version keeps the hash.
 */
export async function hashAgentPackage(root: string): Promise<string> {
    const manifest = await readManifest(root);
    const { files, main } = manifest ?? {};
    const keys: string[] = [];

    const hasFiles = Array.isArray(files) && files.every((entry) => typeof entry === 'string');

    if (hasFiles) {
        const include: string[] = [];
        const exclude: string[] = [];

        for (const entry of files as string[]) {
            const negated = entry.startsWith('!');
            const pattern = normalizePattern(negated ? entry.slice(1) : entry);

            if (pattern.length > 0) {
                (negated ? exclude : include).push(pattern, `${pattern}/**`);
            }
        }

        if (include.length > 0) {
            const found = await locateMany(include, {
                cwd: root,
                onlyFiles: true,
                dot: false,
                ignore: [...PACKAGE_HASH_IGNORE, ...exclude],
            });

            keys.push(...found.map((info) => toKey(root, info.path)));
        }

        if (typeof main === 'string' && await isFile(join(root, main))) {
            keys.push(normalizePattern(main));
        }
    } else {
        const found = await locateMany('**/*', {
            cwd: root,
            onlyFiles: true,
            dot: false,
            ignore: [...PACKAGE_HASH_IGNORE, `${PACKAGE_TEST_DIR}/**`],
        });

        keys.push(...found.map((info) => toKey(root, info.path)));
    }

    if (manifest !== undefined) {
        keys.push(PACKAGE_MANIFEST);
    }

    const counted = keys.filter((key) => key.split('/').every((segment) => !(segment.startsWith('.') || segment === 'node_modules')) &&
        !isHashIgnored(key));

    return hashFiles(root, counted, (key, path) => {
        if (key === PACKAGE_MANIFEST && manifest !== undefined) {
            const rest = { ...manifest };

            delete rest.version;

            return Promise.resolve(JSON.stringify(rest));
        }

        return readFile(path);
    });
}

/** A `files` entry or `main` as a pattern relative to the root: a leading `./` and trailing `/` dropped. */
function normalizePattern(entry: string): string {
    return entry.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
}
