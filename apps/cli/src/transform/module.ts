/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { registerHooks, setSourceMapsSupport } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
    OXC_RUNTIME_PREFIX,
    TYPESCRIPT_FILE_PATTERN,
    TYPESCRIPT_FORMATS,
} from './constants.ts';
import {
    findTsconfig,
    importTransform,
    isAppFileUrl,
    transformSource,
} from './helpers.ts';
import type { TypeScriptHooksOptions } from './types.ts';

let registration: Promise<void> | undefined;

/** Whether `file` is a TypeScript source (`.ts`, `.mts`, `.cts`; not `.d.ts`). */
export function isTypeScriptFile(file: string): boolean {
    return TYPESCRIPT_FILE_PATTERN.test(file);
}

async function register(cwd: string, from: string): Promise<void> {
    const transform = await importTransform(from);
    const tsconfig = findTsconfig(cwd);
    const decoder = new TextDecoder();

    registerHooks({
        resolve(specifier, context, nextResolve) {
            // only the helpers of the transform output: a dependency keeps its own copy
            if (specifier.startsWith(OXC_RUNTIME_PREFIX) && isAppFileUrl(context.parentURL)) {
                return nextResolve(specifier, { ...context, parentURL: import.meta.url });
            }

            return nextResolve(specifier, context);
        },
        load(url, context, nextLoad) {
            const result = nextLoad(url, context);
            const format = typeof result.format === 'string' ? TYPESCRIPT_FORMATS[result.format] : undefined;

            if (format === undefined || !isAppFileUrl(url) || result.source === undefined) {
                return result;
            }

            const source = typeof result.source === 'string' ?
                result.source :
                decoder.decode(result.source);

            return {
                format,
                source: transformSource(transform, fileURLToPath(url), source, tsconfig),
                shortCircuit: true,
            };
        },
    });

    setSourceMapsSupport(true);
}

/**
 * Registers, once per process, the synchronous `load` and `resolve` hooks
 * that transform TypeScript sources outside `node_modules` with rolldown's
 * `transformSync` (through the tsdown `chamvi build` imports, the one
 * resolving from the CLI itself, with the nearest `tsconfig.json` at or
 * above `cwd`, so legacy decorators load as the build compiles them), and
 * enables source maps. A
 * later call is a no-op, whatever its `cwd`; a failed one (no tsdown) can be
 * retried. `from` (internal, for the specs) is where tsdown resolves from.
 */
export function registerTypeScriptHooks(
    options: TypeScriptHooksOptions,
    from: string = import.meta.url,
): Promise<void> {
    registration ??= register(options.cwd, from).catch((error: unknown) => {
        registration = undefined;

        throw error;
    });

    return registration;
}
