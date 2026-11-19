/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { resolveWorkspacePath } from '@chamvi/sandbox';
import { HOME_LOG_PATTERN } from '../constants.ts';
import { requireString } from './input.ts';

/** A workspace-relative path ('.' for the root); ValidationError for escapes. */
export function requirePath(value: unknown, name = 'path'): string {
    return resolveWorkspacePath(requireString(value, name));
}

/**
 * The path below `$HOME` of an output log (`~/.chamvi/out/<id>.stdout.log`,
 * `~/.chamvi/jobs/<id>/output`), undefined for any other path.
 */
export function homeLogPath(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    return HOME_LOG_PATTERN.exec(value)?.[1];
}

/** An optional workspace-relative path, '.' when omitted. */
export function optionalPath(value: unknown, name = 'path'): string {
    if (value === undefined) {
        return '.';
    }

    return requirePath(value, name);
}
