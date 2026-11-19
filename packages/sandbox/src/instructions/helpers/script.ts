/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { SandboxError } from '@chamvi/core';
import type { ExecResult } from '../../workspace/types.ts';
import {
    INSTRUCTION_SOURCE_MAX_BYTES,
    MISSING_UTILITY_EXIT,
    PROTOCOL,
} from '../constants.ts';
import type { InspectionStatus, ReadOutcome } from '../types.ts';

const STATUS_PATTERN = /^(absent|file|dir|special|(link|denied) ([1-9]\d*))$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

/** Refuses an exec result that is no complete answer of the discovery script. */
export function assertScriptResult(result: ExecResult): void {
    if (result.timedOut) {
        throw new SandboxError('Repository instruction discovery timed out.');
    }

    if (result.stdoutTruncated || result.stderrTruncated) {
        throw new SandboxError('Repository instruction discovery printed more than the output cap.');
    }

    if (result.exitCode === MISSING_UTILITY_EXIT) {
        const missing = new RegExp(`^${PROTOCOL} missing (head|base64|tr)\\n$`).exec(result.stdout);

        if (missing) {
            throw new SandboxError(`Repository instruction discovery needs ${missing[1]} in /usr/bin or /bin of the workspace image.`);
        }
    }

    if (result.exitCode !== 0) {
        throw new SandboxError(`Repository instruction discovery failed (exit ${result.exitCode}).`);
    }
}

const malformed = () => new SandboxError('Repository instruction discovery answered with a malformed frame.');

function parseStatus(text: string): InspectionStatus {
    const match = STATUS_PATTERN.exec(text);

    if (!match) {
        throw malformed();
    }

    if (match[2] === 'link' || match[2] === 'denied') {
        return { kind: match[2], at: Number(match[3]) };
    }

    return { kind: match[1] as 'absent' | 'file' | 'dir' | 'special' };
}

/** The statuses of an `inspect` answer for `count` paths, in order. */
export function parseInspectOutput(result: ExecResult, count: number): InspectionStatus[] {
    assertScriptResult(result);

    const lines = result.stdout.split('\n');

    if (
        result.stderr !== '' ||
        lines.length !== count + 3 ||
        lines[0] !== `${PROTOCOL} inspect ${count}` ||
        lines[count + 1] !== `${PROTOCOL} end` ||
        lines[count + 2] !== ''
    ) {
        throw malformed();
    }

    return lines.slice(1, count + 1).map((line, index) => {
        const space = line.indexOf(' ');

        if (space < 0 || line.slice(0, space) !== String(index)) {
            throw malformed();
        }

        return parseStatus(line.slice(space + 1));
    });
}

function decodeBase64(data: string): Uint8Array {
    if (data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) {
        throw malformed();
    }

    const bytes = Buffer.from(data, 'base64');

    // canonical only: a re-encoding gives the same text back
    if (bytes.toString('base64') !== data) {
        throw malformed();
    }

    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** The outcome of a `read` answer. */
export function parseReadOutput(result: ExecResult): ReadOutcome {
    assertScriptResult(result);

    const lines = result.stdout.split('\n');
    const head = new RegExp(`^${PROTOCOL} read (.+)$`).exec(lines[0] ?? '')?.[1];

    if (head === undefined) {
        throw malformed();
    }

    if (head !== 'file') {
        if (result.stderr !== '' || lines.length !== 3 || lines[1] !== `${PROTOCOL} end` || lines[2] !== '') {
            throw malformed();
        }

        if (head === 'denied') {
            return { kind: 'unreadable' };
        }

        const status = parseStatus(head);

        if (status.kind === 'file') {
            throw malformed();
        }

        return status;
    }

    if (lines.length !== 4 || lines[2] !== `${PROTOCOL} end` || lines[3] !== '') {
        throw malformed();
    }

    const status = new RegExp(`^${PROTOCOL} head (\\d+)\\n$`).exec(result.stderr)?.[1];

    if (status === undefined) {
        throw malformed();
    }

    const bytes = decodeBase64(lines[1] ?? '');

    if (bytes.byteLength > INSTRUCTION_SOURCE_MAX_BYTES + 1) {
        throw malformed();
    }

    if (status !== '0') {
        return { kind: 'unreadable' };
    }

    return { kind: 'bytes', bytes };
}
