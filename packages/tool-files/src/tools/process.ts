/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { SandboxError, ValidationError, defineTool } from '@chamvi/core';
import { jsonSchema } from 'ai';
import type { Tool } from 'ai';
import { Bash, decodeBytesToUtf8, stdoutAsBytes } from 'just-bash';
import type { FileToolsOptionsNormalized } from '../options/types.ts';
import {
    FILES_COMMANDS,
    FILES_MAX_COMMAND_BYTES,
    FILES_MAX_FILES,
    FILES_MAX_OUTPUT_BYTES,
} from './constants.ts';
import {
    assertSize,
    boundedText,
    processInput,
    signalOf,
} from './helpers.ts';
import type { ProcessFilesInput, ProcessFilesResult } from './types.ts';

export function processFilesTool(options: FileToolsOptionsNormalized): Tool<ProcessFilesInput, ProcessFilesResult> {
    return defineTool({
        trust: { taint: true },
        description: 'Process selected run artifacts as JSON, CSV or text in a fresh in-memory shell. Discover artifact IDs with list_artifacts. Supports jq, xan, awk and text commands; no network, host executables or persistent files. Select output paths and media types to publish files as run artifacts.',
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
            toolCallId,
        }) => {
            const {
                command,
                inputs,
                outputs,
            } = processInput(input);
            const signal = signalOf(context, abortSignal);

            try {
                signal.throwIfAborted();

                const files: Record<string, Uint8Array> = {};

                if (inputs.length > 0) {
                    const metadata = await context.artifacts.list();

                    signal.throwIfAborted();

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

                    size = 0;

                    for (const selected of inputs) {
                        signal.throwIfAborted();

                        const loaded = await context.artifacts.get(selected.artifactId);

                        signal.throwIfAborted();

                        if (!loaded) {
                            throw new ValidationError(`Artifact ${selected.artifactId} is unavailable.`);
                        }

                        size += loaded.data.byteLength;
                        assertSize(size, options.maxBytes);
                        files[`/workspace/${selected.path}`] = loaded.data;
                    }
                }

                let bash: Bash;
                let result;

                try {
                    bash = new Bash({
                        cwd: '/workspace',
                        files,
                        commands: FILES_COMMANDS,
                        executionLimitProfile: 'hardened',
                        executionLimits: {
                            maxExecutionTimeMs: options.timeoutMs,
                            maxSourceBytes: FILES_MAX_COMMAND_BYTES,
                            maxOutputSize: FILES_MAX_OUTPUT_BYTES,
                            // Synthetic command files need space even with a tiny artifact allowance.
                            maxFileSystemBytes: Math.max(FILES_MAX_OUTPUT_BYTES, options.maxBytes * 2),
                        },
                    });
                    result = await bash.exec(command, { signal });
                } catch (cause) {
                    signal.throwIfAborted();

                    throw new SandboxError('File processing failed.', { cause });
                }

                signal.throwIfAborted();

                const stderr = boundedText(result.stderr, FILES_MAX_OUTPUT_BYTES);
                const stdout = boundedText(decodeBytesToUtf8(stdoutAsBytes(result)), FILES_MAX_OUTPUT_BYTES - Buffer.byteLength(stderr));
                const response: ProcessFilesResult = {
                    exitCode: result.exitCode,
                    stdout,
                    stderr,
                    artifacts: [],
                };

                if (result.exitCode !== 0) {
                    return response;
                }

                let size = 0;

                for (const selected of outputs) {
                    let stat;

                    try {
                        stat = await bash.fs.lstat(`/workspace/${selected.path}`);
                    } catch (cause) {
                        signal.throwIfAborted();

                        if (Error.isError(cause) && cause.message.includes('ENOENT')) {
                            throw new ValidationError(`Output ${selected.path} does not exist.`);
                        }

                        throw new SandboxError('Could not inspect file output.', { cause });
                    }

                    signal.throwIfAborted();

                    if (!stat.isFile) {
                        throw new ValidationError(`Output ${selected.path} is not a regular file.`);
                    }

                    size += stat.size;
                    assertSize(size, options.maxBytes);
                }

                const staged: Uint8Array[] = [];

                size = 0;

                for (const selected of outputs) {
                    let data;

                    try {
                        data = await bash.fs.readFileBuffer(`/workspace/${selected.path}`);
                    } catch (cause) {
                        signal.throwIfAborted();

                        throw new SandboxError('Could not read file output.', { cause });
                    }

                    signal.throwIfAborted();
                    size += data.byteLength;
                    assertSize(size, options.maxBytes);
                    staged.push(data);
                }

                for (const [index, selected] of outputs.entries()) {
                    signal.throwIfAborted();
                    response.artifacts.push(await context.artifacts.put({
                        key: `process_files:${createHash('sha256').update(JSON.stringify([toolCallId, selected.path])).digest('hex')}`,
                        filename: selected.path,
                        mediaType: selected.mediaType,
                        data: staged[index]!,
                    }));
                    signal.throwIfAborted();
                }

                return response;
            } catch (cause) {
                signal.throwIfAborted();

                throw cause;
            }
        },
    });
}
