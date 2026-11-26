/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ValidationError } from '@chamvi/app';
import { TSDOWN_PACKAGE } from '../commands/constants.ts';
import { isTsdownMissing } from '../commands/helpers.ts';
import { createUsageError, isRecord } from '../run/helpers.ts';
import {
    NODE_MODULES_SEGMENT,
    ROLLDOWN_UTILS,
    ROLLDOWN_UTILS_MISSING_CODES,
    TSCONFIG_FILE,
    TSDOWN_RANGE,
} from './constants.ts';
import type { TransformError, TransformSync } from './types.ts';

/**
 * rolldown's `transformSync`, through the tsdown that resolves from `from`
 * (a file URL or path; the CLI's own module, where `chamvi build` imports
 * tsdown from, so dev transforms with the rolldown the build bundles with).
 * No tsdown is a `cli_usage` error.
 */
export async function importTransform(from: string): Promise<TransformSync> {
    let tsdown: string;

    try {
        tsdown = createRequire(from).resolve(TSDOWN_PACKAGE);
    } catch (error) {
        if (isTsdownMissing(error)) {
            throw createUsageError(`The entry is TypeScript: install ${TSDOWN_PACKAGE} ${TSDOWN_RANGE} to load it.`);
        }

        throw error;
    }

    const outdated = () => createUsageError(`The rolldown of ${TSDOWN_PACKAGE} exports no transformSync(): install ${TSDOWN_PACKAGE} ${TSDOWN_RANGE}.`);
    let file: string;

    try {
        file = createRequire(tsdown).resolve(ROLLDOWN_UTILS);
    } catch (error) {
        const { code } = isRecord(error) ? error : {};

        if (typeof code === 'string' && ROLLDOWN_UTILS_MISSING_CODES.includes(code)) {
            throw outdated();
        }

        throw error;
    }

    const utils: unknown = await import(pathToFileURL(file).href);
    const transform = isRecord(utils) ? utils.transformSync : undefined;

    if (typeof transform !== 'function') {
        throw outdated();
    }

    return transform as TransformSync;
}

/**
 * The nearest `tsconfig.json` at or above `cwd`, else `false` (rolldown's
 * defaults): the lookup of tsdown's `findTsconfig()` for a build without a
 * `tsconfig` option, so the transform reads the file `chamvi build` does.
 */
export function findTsconfig(cwd: string): string | false {
    let dir = path.resolve(cwd);

    for (;;) {
        const file = path.join(dir, TSCONFIG_FILE);

        if (existsSync(file)) {
            return file;
        }

        const parent = path.dirname(dir);

        if (parent === dir) {
            return false;
        }

        dir = parent;
    }
}

/** Whether `url` is a file the load hook transforms when TypeScript: a `file:` URL outside `node_modules`. */
export function isAppFileUrl(url: string | undefined): boolean {
    return url !== undefined && url.startsWith('file:') && !url.includes(NODE_MODULES_SEGMENT);
}

function formatError(filename: string, error: TransformError): string {
    const [summary = ''] = error.message.split('\n');
    const where = error.loc ? `${filename}:${error.loc.line}:${error.loc.column + 1}` : filename;

    return `${where}: ${summary}`;
}

/**
 * The JavaScript of a TypeScript source with an inline source map; a source
 * rolldown cannot transform (a syntax error) is a `validation_error` naming
 * the file and line of each error.
 */
export function transformSource(
    transform: TransformSync,
    filename: string,
    source: string,
    tsconfig: string | false,
): string {
    const result = transform(filename, source, { sourcemap: true, tsconfig });

    if (result.errors.length > 0) {
        throw new ValidationError(result.errors.map((error) => formatError(filename, error)).join('\n'));
    }

    if (result.map === undefined) {
        return result.code;
    }

    const map = Buffer.from(JSON.stringify(result.map)).toString('base64');

    return `${result.code}\n//# sourceMappingURL=data:application/json;base64,${map}\n`;
}
