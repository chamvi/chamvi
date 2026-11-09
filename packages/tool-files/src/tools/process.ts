/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import {
    SandboxError,
    ValidationError,
    defineTool,
    toolCallKey,
} from '@chamvi/core';
import { jsonSchema } from 'ai';
import type { Tool } from 'ai';
import type { FileToolsOptionsNormalized } from '../options/types.ts';
import { runInterpreter } from '../runner/module.ts';
import {
    FILES_COMMANDS,
    FILES_FILESYSTEM_OVERHEAD_BYTES,
    FILES_MAX_COMMAND_BYTES,
    FILES_MAX_DIAGNOSTIC_BYTES,
    FILES_MAX_FILES,
    FILES_RECORD_BUDGETS,
} from './constants.ts';
import {
    assertSize,
    boundedDiagnostics,
    processInput,
    signalOf,
} from './helpers.ts';
import type { ProcessFilesInput, ProcessFilesResult } from './types.ts';

export function processFilesTool(options: FileToolsOptionsNormalized): Tool<ProcessFilesInput, ProcessFilesResult> {
    return defineTool({
        trust: { taint: true },
        description: 'Process selected run artifacts as JSON, CSV or text in a fresh in-memory shell. Discover artifact IDs with list_artifacts. Supports jq, xan, awk and text commands; no network, host executables or persistent files. Select output paths and media types to publish files as run artifacts. Returned stdout/stderr share 65,536 UTF-8 bytes, retaining stderr first; clipping includes [output truncated]. Intermediate work and scratch files have separate finite budgets. A timed-out command exits 124, one out of memory 137.',
        inputSchema: jsonSchema<ProcessFilesInput>({
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    minLength: 1,
                    maxLength: FILES_MAX_COMMAND_BYTES,
                    description: 'Shell source, at most 16,384 UTF-8 bytes.',
                },
                inputs: {
                    type: 'array',
                    maxItems: FILES_MAX_FILES,
                    items: {
                        type: 'object',
                        properties: {
                            artifactId: { type: 'string', minLength: 1 },
                            path: {
                                type: 'string',
                                minLength: 1,
                                maxLength: 255,
                            },
                        },
                        required: ['artifactId', 'path'],
                        additionalProperties: false,
                    },
                },
                outputs: {
                    type: 'array',
                    maxItems: FILES_MAX_FILES,
                    items: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                minLength: 1,
                                maxLength: 255,
                            },
                            mediaType: { type: 'string', minLength: 1 },
                        },
                        required: ['path', 'mediaType'],
                        additionalProperties: false,
                    },
                },
            },
            required: ['command'],
            additionalProperties: false,
        }),
        execute: async (input, {
            context,
            abortSignal,
        }) => {
            const {
                command,
                inputs,
                outputs,
            } = processInput(input);
            const signal = signalOf(context, abortSignal);

            const callKey = toolCallKey(context);
            const files: Record<string, Uint8Array> = {};

            if (inputs.length > 0) {
                const metadata = await context.artifacts.list();
                let size = 0;

                for (const selected of inputs) {
                    const artifact = metadata.find((item) => item.id === selected.artifactId && item.runId === context.run.runId);

                    if (!artifact) {
                        throw new ValidationError(`Artifact ${selected.artifactId} does not belong to this run.`);
                    }

                    assertSize(artifact.size, options.maxBytes);
                    size += artifact.size;
                    assertSize(size, options.maxBytes);
                }

                for (const selected of inputs) {
                    const loaded = await context.artifacts.get(selected.artifactId);

                    if (!loaded) {
                        throw new ValidationError(`Artifact ${selected.artifactId} is unavailable.`);
                    }

                    files[`/workspace/${selected.path}`] = loaded.data;
                }
            }

            const maxWorkOutputBytes = Math.max(FILES_MAX_DIAGNOSTIC_BYTES, options.maxBytes * 4);
            const outcome = await runInterpreter({
                command,
                files,
                commands: FILES_COMMANDS,
                executionLimits: {
                    ...FILES_RECORD_BUDGETS,
                    maxExecutionTimeMs: options.timeoutMs,
                    maxSourceBytes: FILES_MAX_COMMAND_BYTES,
                    maxOutputSize: maxWorkOutputBytes,
                    // Reserve synthetic files in addition to full selected input/output room.
                    maxFileSystemBytes: FILES_FILESYSTEM_OVERHEAD_BYTES + options.maxBytes * 2,
                },
                outputs: outputs.map((selected) => selected.path),
                maxBytes: options.maxBytes,
            }, { timeoutMs: options.timeoutMs, signal });

            if (outcome.type === 'invalid') {
                throw new ValidationError(outcome.message);
            }

            if (outcome.type === 'failed') {
                throw new SandboxError(outcome.message, { cause: new Error(outcome.cause) });
            }

            const { stdout, stderr } = boundedDiagnostics(outcome.stdout, outcome.stderr);
            const response: ProcessFilesResult = {
                exitCode: outcome.exitCode,
                stdout,
                stderr,
                artifacts: [],
            };

            if (outcome.exitCode !== 0) {
                return response;
            }

            const staged = outcome.outputs;

            for (const [index, selected] of outputs.entries()) {
                signal.throwIfAborted();
                response.artifacts.push(await context.artifacts.put({
                    key: `process_files:${createHash('sha256').update(JSON.stringify([callKey, selected.path])).digest('hex')}`,
                    filename: selected.path,
                    mediaType: selected.mediaType,
                    data: staged[index]!,
                }));
            }

            return response;
        },
    });
}
