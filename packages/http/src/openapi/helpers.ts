/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isObject } from 'smob';

/**
 * `dist/swagger.json` of this package, found through its own `package.json`
 * (a self-reference): the published package reads the file next to
 * `dist/index.mjs`, and a consumer that runs `@chamvi/http` from its sources
 * (a Vitest alias) reads the last built one. Where the package cannot
 * resolve itself (bundled into another file), the file next to the module.
 */
export function resolveOpenApiDocumentPath(): string {
    try {
        return join(dirname(createRequire(import.meta.url).resolve('@chamvi/http/package.json')), 'dist', 'swagger.json');
    } catch {
        return fileURLToPath(new URL('swagger.json', import.meta.url));
    }
}

/**
 * The document at `path` with `servers` set to the app's root
 * (`basePath`, or `/`); `undefined` when the file cannot be read or is not
 * a JSON object (`null`, an array, truncated JSON).
 */
export function loadOpenApiDocument(path: string, basePath: string): Record<string, unknown> | undefined {
    let document: unknown;

    try {
        document = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return undefined;
    }

    if (!isObject(document)) {
        return undefined;
    }

    return { ...document, servers: [{ url: basePath || '/' }] };
}


function canonical(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => canonical(item));
    }

    if (isObject(value)) {
        const out: Record<string, unknown> = {};

        for (const key of Object.keys(value).toSorted()) {
            out[key] = canonical(value[key]);
        }

        return out;
    }

    return value;
}

/** The JSON of `value` with the keys of every object sorted, to compare two definitions. */
export function canonicalJson(value: unknown): string {
    return JSON.stringify(canonical(value)) ?? 'undefined';
}
