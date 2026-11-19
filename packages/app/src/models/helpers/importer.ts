/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';

/**
 * True when the package itself is not installed, not when something it
 * imports is missing: Node's ERR_MODULE_NOT_FOUND "Cannot find package
 * '<specifier>'", or Vite's (the Vitest module runner's) code-less
 * "Could not resolve "<specifier>"".
 */
export function isPackageNotFound(error: unknown, specifier: string): boolean {
    if (!isObject(error) || typeof error.message !== 'string') {
        return false;
    }

    if (error.code === 'ERR_MODULE_NOT_FOUND') {
        return error.message.startsWith(`Cannot find package '${specifier}'`);
    }

    return error.code === undefined && error.message.startsWith(`Could not resolve "${specifier}"`);
}

export function defaultImporter(specifier: string): Promise<unknown> {
    return import(specifier);
}
