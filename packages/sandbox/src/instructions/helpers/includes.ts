/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { posix } from 'node:path';
import { INSTRUCTION_PATH_MAX_BYTES } from '../constants.ts';
import type { IncludeTarget } from '../types.ts';
import { byteLength, isGitPath } from './path.ts';

const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const INCLUDE_PATTERN = /^@(\S+)$/;
const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * The include references of an instruction text in order: lines that are
 * `@<path>` alone (surrounding whitespace allowed, none inside the path),
 * outside backtick and tilde fences of three or more characters.
 */
export function parseIncludes(text: string): string[] {
    const includes: string[] = [];
    let fence: { char: string; length: number } | undefined;

    for (const line of text.split(/\r?\n/)) {
        const match = FENCE_PATTERN.exec(line);
        const marker = match?.[1] ?? '';
        const rest = match?.[2] ?? '';

        if (fence) {
            if (match && marker[0] === fence.char && marker.length >= fence.length && rest.trim() === '') {
                fence = undefined;
            }

            continue;
        }

        // an info string of a backtick fence holds no backtick
        if (match && !(marker[0] === '`' && rest.includes('`'))) {
            fence = { char: marker.charAt(0), length: marker.length };

            continue;
        }

        const include = INCLUDE_PATTERN.exec(line.trim())?.[1];

        if (include) {
            includes.push(include);
        }
    }

    return includes;
}

/** Resolves an include reference against the file holding it, lexically and inside the workspace only. */
export function resolveInclude(including: string, reference: string): IncludeTarget {
    if (byteLength(reference) > INSTRUCTION_PATH_MAX_BYTES) {
        return {
            kind: 'diagnostic',
            code: 'limit',
            message: `The reference is longer than ${INSTRUCTION_PATH_MAX_BYTES} bytes.`,
        };
    }

    if (
        reference.includes('\0') ||
        SCHEME_PATTERN.test(reference) ||
        reference.startsWith('/') ||
        reference.startsWith('~') ||
        reference.startsWith('\\')
    ) {
        return {
            kind: 'diagnostic',
            code: 'outside-workspace',
            message: 'Only relative paths inside the workspace can be included.',
        };
    }

    let path = posix.normalize(posix.join(posix.dirname(including), reference));

    if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
    }

    if (path === '..' || path.startsWith('../')) {
        return {
            kind: 'diagnostic',
            code: 'outside-workspace',
            message: 'The reference leaves the workspace.',
        };
    }

    if (byteLength(path) > INSTRUCTION_PATH_MAX_BYTES) {
        return {
            kind: 'diagnostic',
            code: 'limit',
            message: `The path is longer than ${INSTRUCTION_PATH_MAX_BYTES} bytes.`,
        };
    }

    if (isGitPath(path)) {
        return {
            kind: 'diagnostic',
            code: 'unsupported-file',
            message: 'Paths in .git are never read.',
        };
    }

    return { kind: 'path', path };
}
