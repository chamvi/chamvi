/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export interface ILogger {
    error(message: string, error?: unknown, fields?: Record<string, unknown>): void;
    warn(message: string, fields?: Record<string, unknown>): void;
    info(message: string, fields?: Record<string, unknown>): void;
    debug(message: string, fields?: Record<string, unknown>): void;
}
