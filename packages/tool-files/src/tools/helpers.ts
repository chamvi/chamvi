/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError, isArtifactMediaType } from '@chamvi/core';
import type { ToolContext } from '@chamvi/core';
import { isObject } from 'smob';
import { aggregateLimitMessage } from '../runner/helpers.ts';
import { FILES_MAX_COMMAND_BYTES, FILES_MAX_DIAGNOSTIC_BYTES, FILES_MAX_FILES } from './constants.ts';
import type { ProcessFilesInput } from './types.ts';

export function inputObject(value: unknown): Record<string, unknown> {
    if (!isObject(value)) {
        throw new ValidationError('The tool input must be an object.');
    }

    return value;
}

function nonemptyString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`${name} must be a non-empty string.`);
    }

    return value;
}

function relativePath(value: unknown): string {
    const path = nonemptyString(value, 'path');

    if (Buffer.byteLength(path) > 255 || path.startsWith('/') || path.includes('\\') || /\p{Cc}/u.test(path) || path.split('/').includes('..')) {
        throw new ValidationError('path must be a relative POSIX file path of at most 255 bytes without traversal or control characters.');
    }

    const normalized = path.split('/').filter((part) => part !== '' && part !== '.').join('/');

    if (!normalized || path.endsWith('/')) {
        throw new ValidationError('path must name a file, not a directory root.');
    }

    return normalized;
}

function selections(value: unknown): Array<Record<string, unknown> & { path: string }> {
    if (value === undefined) {
        return [];
    }

    if (!Array.isArray(value) || value.length > FILES_MAX_FILES) {
        throw new ValidationError(`A selection must contain at most ${FILES_MAX_FILES} files.`);
    }

    const seen = new Set<string>();
    const selected = Array.from(value, (item) => {
        const body = inputObject(item);
        const path = relativePath(body.path);

        if (seen.has(path)) {
            throw new ValidationError(`Duplicate selected path: ${path}.`);
        }

        seen.add(path);

        return { ...body, path };
    });

    // a file path cannot also be a directory of another selected path
    for (const { path } of selected) {
        const nested = selected.find((other) => other.path.startsWith(`${path}/`));

        if (nested) {
            throw new ValidationError(`Selected path "${path}" is a file and a directory of "${nested.path}".`);
        }
    }

    return selected;
}

export function processInput(input: unknown): Required<ProcessFilesInput> {
    const body = inputObject(input);
    const command = nonemptyString(body.command, 'command');

    if (Buffer.byteLength(command) > FILES_MAX_COMMAND_BYTES) {
        throw new ValidationError(`command must be at most ${FILES_MAX_COMMAND_BYTES} UTF-8 bytes.`);
    }

    const inputs = selections(body.inputs).map((item) => ({
        artifactId: nonemptyString(item.artifactId, 'artifactId'),
        path: item.path,
    }));
    const outputs = selections(body.outputs).map((item) => {
        if (!isArtifactMediaType(item.mediaType)) {
            throw new ValidationError('mediaType must be a type/subtype without parameters.');
        }

        return { path: item.path, mediaType: item.mediaType };
    });

    return {
        command,
        inputs,
        outputs,
    };
}

export function signalOf(context: ToolContext, abortSignal?: AbortSignal): AbortSignal {
    return abortSignal ? AbortSignal.any([context.run.signal, abortSignal]) : context.run.signal;
}

export function assertSize(size: number, maxBytes: number): void {
    if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
        throw new ValidationError(aggregateLimitMessage(maxBytes));
    }
}

function boundedText(value: string, maxBytes: number): string {
    const bytes = Buffer.from(value);

    // Streaming decode drops an incomplete final code point instead of adding a replacement character.
    return bytes.byteLength <= maxBytes ? value : new TextDecoder().decode(bytes.subarray(0, maxBytes), { stream: true });
}

export function boundedDiagnostics(stdout: string, stderr: string): { stdout: string; stderr: string } {
    if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) <= FILES_MAX_DIAGNOSTIC_BYTES) {
        return { stdout, stderr };
    }

    const marker = '[output truncated]';
    const textBytes = FILES_MAX_DIAGNOSTIC_BYTES - Buffer.byteLength(marker);
    const boundedStderr = boundedText(stderr, textBytes);
    const boundedStdout = boundedText(stdout, textBytes - Buffer.byteLength(boundedStderr));

    return boundedStderr === stderr ? {
        stdout: boundedStdout + marker,
        stderr: boundedStderr,
    } : {
        stdout: boundedStdout,
        stderr: boundedStderr + marker,
    };
}
