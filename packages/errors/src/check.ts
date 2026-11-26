/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    INSTANCEOF_PROPERTY,
    isObject,
    isError as isRawError,
    matchesInstanceof,
} from '@ebec/core';
import type { ChamviError } from './module.ts';
import { CHAMVI_ERROR_INSTANCE } from './module.ts';

/**
 * Duck-type guard for `Error`.
 *
 * Re-exports `@ebec/core`'s shape-based check: `input` matches when it
 * carries the standard `name` / `message` / `stack` triplet, regardless
 * of which realm or class hierarchy produced it. Use this instead of
 * `instanceof Error` for cross-realm boundaries (worker threads,
 * duplicate-module copies) where `instanceof` can yield false negatives.
 */
export function isError(input: unknown): input is Error {
    return isRawError(input);
}

/**
 * Duck-type guard for ChamviError.
 *
 * The chain decides, and only the chain: it matches when the ChamviError
 * marker is in it, as the native symbol (in-process) or its serialized
 * string form (JSON-rehydrated). Subclass instances accumulate this
 * marker, so any ChamviError subclass matches too, while a foreign
 * `@ebec/core` error does not: it announced its ancestry and ChamviError
 * is not in it. Chain-less input never matches.
 */
export function isChamviError(input: unknown): input is ChamviError {
    if (!isObject(input) || !Array.isArray(input[INSTANCEOF_PROPERTY])) {
        return false;
    }

    return matchesInstanceof(input, CHAMVI_ERROR_INSTANCE);
}
