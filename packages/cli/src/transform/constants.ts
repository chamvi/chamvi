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

/** The tsconfig of the working directory, the one `chamvi build` (tsdown) reads. */
export const TSCONFIG_FILE = 'tsconfig.json';

export const NODE_MODULES_SEGMENT = '/node_modules/';
