/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { dirname, join } from 'node:path';
import type { Agent } from '@chamvi/core';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import {
    DEV_HASH_LENGTH,
    PACKAGE_MANIFEST,
    PACKAGE_NAME_MAX_LENGTH,
    PACKAGE_NAME_PATTERN,
} from './constants.ts';
import type { AgentEntries } from './types.ts';

/** The package name part of a bare specifier (`@s/pkg/sub` -> `@s/pkg`). */
export function packageNameOf(spec: string): string {
    const parts = spec.split('/');

    return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

/** Whether `value` is a bare package specifier: a package name, optionally followed by `/<subpath>`. */
export function isPackageSpecifier(value: unknown): value is string {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || isBuiltin(value)) {
        return false;
    }

    const name = packageNameOf(value);

    if (name.length > PACKAGE_NAME_MAX_LENGTH || !PACKAGE_NAME_PATTERN.test(name)) {
        return false;
    }

    const subpath = value.slice(name.length);

    if (subpath.length === 0) {
        return true;
    }

    const segments = subpath.slice(1).split('/');

    return subpath.startsWith('/') && segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

/**
 * `value` when it is a bare package specifier, else an
 * InvalidAgentDefinitionError naming `field` (never the value): relative and
 * absolute paths, URLs and Node builtins are refused.
 */
export function assertPackageSpecifier(value: unknown, field: string): string {
    if (!isPackageSpecifier(value)) {
        throw new InvalidAgentDefinitionError(
            `${field} is no bare package specifier (a package name such as @acme/agents, no path or URL).`,
        );
    }

    return value;
}

/** Refuses a specifier listed twice in one source. */
export function assertUniqueSpecifiers(specs: readonly string[], source: string): void {
    const seen = new Set<string>();

    for (const spec of specs) {
        if (seen.has(spec)) {
            throw new InvalidAgentDefinitionError(`${source} lists the package ${spec} twice.`);
        }

        seen.add(spec);
    }
}

/**
 * createApp's `agents` split into agents passed in code (every entry that is no
 * string, checked by the engine) and package specifiers (strings, checked
 * here). Synchronous, no file access.
 */
export function splitAgentEntries(entries: readonly unknown[]): AgentEntries {
    const agents: Agent[] = [];
    const packages: string[] = [];

    entries.forEach((entry, index) => {
        if (typeof entry === 'string') {
            packages.push(assertPackageSpecifier(entry, `createApp's agents[${index}]`));
        } else {
            agents.push(entry as Agent);
        }
    });

    assertUniqueSpecifiers(packages, 'createApp\'s agents');

    return { agents, packages };
}

/** The union of the package lists by specifier, in first-seen order (code, then chamvi.json, then CHAMVI_AGENTS). */
export function mergePackageSpecifiers(...lists: readonly (readonly string[] | undefined)[]): string[] {
    const merged = new Set<string>();

    for (const list of lists) {
        for (const spec of list ?? []) {
            merged.add(spec);
        }
    }

    return [...merged];
}

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

/** The dev marker: `<name>@<version>+<the first DEV_HASH_LENGTH hex of the content hash>`. */
export function devMarker(versionMarker: string, hash: string): string {
    return `${versionMarker}+${hash.slice(0, DEV_HASH_LENGTH)}`;
}

/** Whether `marker` is a dev marker of `versionMarker` (`<name>@<version>+<12 hex>`). */
export function isDevMarkerOf(marker: string, versionMarker: string): boolean {
    const prefix = `${versionMarker}+`;

    return marker.startsWith(prefix) && new RegExp(`^[0-9a-f]{${DEV_HASH_LENGTH}}$`).test(marker.slice(prefix.length));
}

/** Whether a stored revision marker is a package agent's (`<name>@<version>`, dev `+<hash>`), not a folder's content hash. */
export function isPackageMarker(marker: string): boolean {
    return marker.includes('@');
}

/**
 * The user conditions of this process (`--conditions` / `-C`, `=value` or the
 * next argument), from `execArgv` and then `NODE_OPTIONS`, each once in
 * first-seen order: the conditions Node's own resolution adds to `node` and
 * `import`, so a package agent resolves like the code that imports it.
 */
export function userConditions(execArgv: readonly string[], nodeOptions: string | undefined): string[] {
    const conditions = new Set<string>();
    // each source on its own: a flag ending one never takes the next one's first argument
    const sources = [execArgv, (nodeOptions ?? '').split(/\s+/).filter((arg) => arg.length > 0)];

    for (const args of sources) {
        for (let index = 0; index < args.length; index++) {
            const match = /^(?:--conditions|-C)(?:=(.*))?$/.exec(args[index]!);

            if (match === null) {
                continue;
            }

            const value = match[1] ?? args[++index];

            if (value !== undefined && value.length > 0) {
                conditions.add(value);
            }
        }
    }

    return [...conditions];
}
