/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError, defineTool } from '@chamvi/core';
import { jsonSchema } from 'ai';
import type { Tool } from 'ai';
import { FILES_MAX_FILES } from './constants.ts';
import { inputObject } from './helpers.ts';
import type { ListArtifactsInput, ListArtifactsResult } from './types.ts';

export function listArtifactsTool(): Tool<ListArtifactsInput, ListArtifactsResult> {
    return defineTool({
        trust: { taint: true },
        description: 'List artifact metadata and IDs from this run for process_files, 16 per page. Pass nextOffset as offset to continue. Does not load file bytes.',
        inputSchema: jsonSchema<ListArtifactsInput>({
            type: 'object',
            properties: {
                offset: {
                    type: 'integer',
                    minimum: 0,
                    maximum: Number.MAX_SAFE_INTEGER,
                },
            },
            additionalProperties: false,
        }),
        execute: async (input, { context }) => {
            const body = inputObject(input);
            const offset = body.offset === undefined ? 0 : body.offset;

            if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) {
                throw new ValidationError('offset must be a nonnegative safe integer.');
            }

            const artifacts = await context.artifacts.list();
            const next = offset + FILES_MAX_FILES;

            return { artifacts: artifacts.slice(offset, next), ...(next < artifacts.length ? { nextOffset: next } : {}) };
        },
    });
}
