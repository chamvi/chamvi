/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isBuiltin } from 'node:module';
import type { Agent } from '@chamvi/core';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { PACKAGE_NAME_MAX_LENGTH, PACKAGE_NAME_PATTERN } from '../constants.ts';
import type { AgentEntries } from '../types.ts';

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

/** The union of the package lists by specifier, in first-seen order (code, then chamvi.json, then AGENTS). */
export function mergePackageSpecifiers(...lists: readonly (readonly string[] | undefined)[]): string[] {
    const merged = new Set<string>();

    for (const list of lists) {
        for (const spec of list ?? []) {
            merged.add(spec);
        }
    }

    return [...merged];
}
