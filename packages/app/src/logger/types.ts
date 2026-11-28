/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';
import type { LogLevel } from '../config/types.ts';

export type LoggerOptions = {
    /** Entries below it are dropped; default `info`. */
    level?: LogLevel;
    /** The `time` of every entry; default `systemClock`. */
    clock?: IClock;
    /** One call per JSON line (without the newline); default stderr. */
    write?: (line: string) => void;
};

export type SerializedError = {
    name?: string;
    code?: string;
    message: string;
    stack?: string;
};
