/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { spawn } from 'node:child_process';
import type { Env, IClock } from '@chamvi/app';
import type { ISignalTarget } from '../signals/types.ts';

/** Everything a command touches of the process, injectable for tests. */
export type CliContext = {
    cwd: string;
    env: Env;
    clock: IClock;
    /** Where SIGTERM and SIGINT arrive (`process`). */
    signals: ISignalTarget;
    /** Sets the exit code the process ends with (`process.exitCode`). */
    setExitCode(code: number): void;
    /** Ends the process at once; only for the forced exit. */
    exit(code: number): void;
    stdout(text: string): void;
    stderr(text: string): void;
    /** Default `(specifier) => import(specifier)`. */
    importModule(specifier: string): Promise<unknown>;
    spawn: typeof spawn;
    /** `process.execPath`. */
    execPath: string;
    /** The bin, `dist/cli.mjs`. */
    cliPath: string;
    /**
     * Under `chamvi dev` (stdin is a pipe only the dev CLI writes): once that
     * pipe closes, the CLI died without forwarding a signal, so this ends the
     * whole dev process group (the `node --watch` watcher and this process)
     * with SIGTERM.
     */
    linkToParent(): void;
};
