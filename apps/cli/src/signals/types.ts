/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/app';

export type StopSignal = 'SIGTERM' | 'SIGINT';

/** What a command listens for: the stop signals, SIGHUP (the terminal closed) and the process `exit` (`chamvi dev`). */
export type ProcessEvent = StopSignal | 'SIGHUP' | 'exit';

/** Where signals arrive: `process`, or a fake in tests. */
export interface ISignalTarget {
    on(event: ProcessEvent, fn: () => void): void;
    off(event: ProcessEvent, fn: () => void): void;
}

export type SignalHandlersInput = {
    target: ISignalTarget;
    clock: IClock;
    /** After the first signal, exit 1 when the stop has not settled by then. */
    forceExitMs: number;
    stop: () => Promise<void>;
    setExitCode(code: number): void;
    exit(code: number): void;
    stderr(text: string): void;
};

export type SignalHandlers = {
    /** Whether a first signal arrived (the handlers then own the exit code). */
    readonly signalled: boolean;
    /** Removes the listeners. */
    dispose(): void;
};
