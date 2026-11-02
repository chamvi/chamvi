/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createPackageAliases } from '../loader/helpers.ts';

/** Per process and copy of this package: the pinned specifiers (file URLs) and the agent package roots they apply below. */
let pin: { aliases: Map<string, string>; roots: Set<string> } | undefined;

/**
 * Pins `@chamvi/*`, `ai` and `@ai-sdk/*` to this app's copies
 * (`createPackageAliases`) for every import made from a file below `root`
 * (an agent package's real root, its own `node_modules` included), so a
 * package agent shares the app's engine, context keys and classes even when
 * it installed copies of its own. The first call registers one synchronous
 * resolve hook (`module.registerHooks`) for the process; every other import
 * is left alone. A module imported before its root was added keeps its own
 * resolution.
 */
export function pinPackageImports(root: string): void {
    if (pin === undefined) {
        const aliases = new Map(Object.entries(createPackageAliases(import.meta.url))
            .map(([specifier, path]) => [specifier, pathToFileURL(path).href]));
        const state = { aliases, roots: new Set<string>() };

        registerHooks({
            resolve(specifier, context, nextResolve) {
                const url = state.aliases.get(specifier);
                const { parentURL } = context;

                if (url !== undefined && parentURL !== undefined && isBelow(parentURL, state.roots)) {
                    return { url, shortCircuit: true };
                }

                return nextResolve(specifier, context);
            },
        });

        pin = state;
    }

    pin.roots.add(`${pathToFileURL(root).href}/`);
}

function isBelow(url: string, roots: ReadonlySet<string>): boolean {
    for (const root of roots) {
        if (url.startsWith(root)) {
            return true;
        }
    }

    return false;
}
