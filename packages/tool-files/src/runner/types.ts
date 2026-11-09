/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { BashOptions, CommandName } from 'just-bash';

/** Everything the interpreter thread needs; structured-cloned into it. */
export type InterpreterJob = {
    command: string;
    files: Record<string, Uint8Array>;
    commands: CommandName[];
    executionLimits: NonNullable<BashOptions['executionLimits']>;
    /** Paths relative to the working directory, published only after exit code 0. */
    outputs: string[];
    maxBytes: number;
};

export type InterpreterOutcome =    | {
    type: 'completed';
    exitCode: number;
    stdout: string;
    stderr: string;
    outputs: Uint8Array[];
} |
    { type: 'invalid'; message: string } |
    {
        type: 'failed'; 
        message: string; 
        cause?: string 
    };

export type InterpreterLimits = {
    timeoutMs: number;
    signal: AbortSignal;
};
