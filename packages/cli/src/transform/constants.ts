/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A TypeScript source (`.ts`, `.mts`, `.cts`), not a declaration file. */
export const TYPESCRIPT_FILE_PATTERN = /(?<!\.d)\.[cm]?ts$/;

/** The load formats Node gives a TypeScript source, and the format of its transform. */
export const TYPESCRIPT_FORMATS: Readonly<Record<string, 'module' | 'commonjs'>> = {
    'module-typescript': 'module',
    'commonjs-typescript': 'commonjs',
};

/** The tsdown versions whose rolldown exports `transformSync` from `rolldown/utils`. */
export const TSDOWN_RANGE = '^0.23.4';

/** Where rolldown exports `transformSync` (not its root). */
export const ROLLDOWN_UTILS = 'rolldown/utils';

/** The helpers the transform output imports, resolved from the CLI's own dependency. */
export const OXC_RUNTIME_PREFIX = '@oxc-project/runtime/';

/**
 * The tsconfig file name: the nearest one at or above the working directory
 * configures the transform, the file `chamvi build` (tsdown) finds.
 */
export const TSCONFIG_FILE = 'tsconfig.json';

/** The codes of a `rolldown/utils` that does not resolve through tsdown. */
export const ROLLDOWN_UTILS_MISSING_CODES: readonly string[] = ['ERR_PACKAGE_PATH_NOT_EXPORTED', 'MODULE_NOT_FOUND'];

export const NODE_MODULES_SEGMENT = '/node_modules/';
