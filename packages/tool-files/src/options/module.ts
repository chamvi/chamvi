/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import { FILES_MAX_BYTES, FILES_TIMEOUT_MS } from '../tools/constants.ts';
import type { FileToolsOptions, FileToolsOptionsNormalized } from './types.ts';

export function normalizeOptions(options: FileToolsOptions): FileToolsOptionsNormalized {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError('fileTools() options must be an object.');
    }

    const maxBytes = options.maxBytes === undefined ? FILES_MAX_BYTES : options.maxBytes;
    const timeoutMs = options.timeoutMs === undefined ? FILES_TIMEOUT_MS : options.timeoutMs;

    for (const [name, value, max] of [['maxBytes', maxBytes, 16_777_216], ['timeoutMs', timeoutMs, 2_147_483_647]] as const) {
        if (!Number.isSafeInteger(value) || value < 1 || value > max) {
            throw new InvalidAgentDefinitionError(`fileTools() ${name} must be an integer from 1 to ${max}.`);
        }
    }

    return { maxBytes, timeoutMs };
}
