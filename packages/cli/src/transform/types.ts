/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type TypeScriptHooksOptions = {
    /** The working directory: tsdown resolves from it, and its `tsconfig.json` configures the transform. */
    cwd: string;
};

export type TransformError = {
    message: string;
    loc?: { line: number; column: number };
};

export type TransformResult = {
    code: string;
    map?: unknown;
    errors: TransformError[];
};

/** rolldown's `transformSync`, as far as the hooks call it. */
export type TransformSync = (
    filename: string,
    source: string,
    options: { sourcemap: boolean; tsconfig: string | false },
) => TransformResult;
