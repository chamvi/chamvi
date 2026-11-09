/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type FileToolsOptions = {
    /** Aggregate imported bytes and, separately, exported bytes. Default: 5 MiB. */
    maxBytes?: number;
    /** Interpreter execution deadline in milliseconds. Default: 30 seconds. */
    timeoutMs?: number;
};

export type FileToolsOptionsNormalized = Required<FileToolsOptions>;
