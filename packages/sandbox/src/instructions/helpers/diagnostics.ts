/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { INSTRUCTION_DIAGNOSTICS_MAX, INSTRUCTION_DIAGNOSTICS_MAX_BYTES } from '../constants.ts';
import type { DiagnosticList, RepositoryInstructionDiagnostic } from '../types.ts';
import { byteLength } from './path.ts';

/**
 * The bounded diagnostics: each path and code once, at most
 * `INSTRUCTION_DIAGNOSTICS_MAX` entries and `INSTRUCTION_DIAGNOSTICS_MAX_BYTES`
 * of paths and messages, the last slot a `limit` entry saying more were
 * dropped. Paths and messages pass through `redact` first.
 */
export function createDiagnosticList(redact: (text: string) => string): DiagnosticList {
    const entries: RepositoryInstructionDiagnostic[] = [];
    const seen = new Set<string>();
    const closing: RepositoryInstructionDiagnostic = {
        path: '.',
        code: 'limit',
        message: 'Further diagnostics were dropped.',
    };
    const reserve = byteLength(closing.path) + byteLength(closing.message);
    let bytes = 0;
    let full = false;

    return {
        entries,
        add(path, code, message) {
            if (full) {
                return;
            }

            const key = `${code}\0${path}`;

            if (seen.has(key)) {
                return;
            }

            seen.add(key);

            const entry = {
                path: redact(path),
                code,
                message: redact(message),
            };
            const size = byteLength(entry.path) + byteLength(entry.message);

            if (entries.length >= INSTRUCTION_DIAGNOSTICS_MAX - 1 || bytes + size > INSTRUCTION_DIAGNOSTICS_MAX_BYTES - reserve) {
                full = true;
                entries.push(closing);

                return;
            }

            bytes += size;
            entries.push(entry);
        },
    };
}
