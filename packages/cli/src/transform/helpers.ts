/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ValidationError } from '@chamvi/app';
import { TSDOWN_PACKAGE } from '../commands/constants.ts';
import { isTsdownMissing } from '../commands/helpers.ts';
import { createUsageError, isRecord } from '../run/helpers.ts';
import { ROLLDOWN_UTILS, TSDOWN_RANGE } from './constants.ts';
import type { TransformError, TransformSync } from './types.ts';

/**
 * rolldown's `transformSync`, through the tsdown that resolves from `cwd`
 * (the rolldown `chamvi build` compiles with). No tsdown is a `cli_usage`
 * error.
 */
export async function importTransform(cwd: string): Promise<TransformSync> {
    let tsdown: string;

    try {
        tsdown = createRequire(path.resolve(cwd, 'package.json')).resolve(TSDOWN_PACKAGE);
    } catch (error) {
        if (isTsdownMissing(error)) {
            throw createUsageError(`The entry is TypeScript: install ${TSDOWN_PACKAGE} ${TSDOWN_RANGE} to load it.`);
        }

        throw error;
    }

    const utils: unknown = await import(pathToFileURL(createRequire(tsdown).resolve(ROLLDOWN_UTILS)).href);
    const transform = isRecord(utils) ? utils.transformSync : undefined;

    if (typeof transform !== 'function') {
        throw createUsageError(`The rolldown of ${TSDOWN_PACKAGE} exports no transformSync(): install ${TSDOWN_PACKAGE} ${TSDOWN_RANGE}.`);
    }

    return transform as TransformSync;
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
