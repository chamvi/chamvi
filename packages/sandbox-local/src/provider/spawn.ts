/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { ClockTimer } from '@chamvi/core';
import { SandboxError } from '@chamvi/core';
import { OUTPUT_MAX_BYTES, createOutputCollector } from '@chamvi/sandbox';
import type { ExecResult } from '@chamvi/sandbox';
import { KILL_GRACE_MS } from './constants.ts';
import { errnoCode, exitCodeOf, killGroup } from './helpers.ts';
import type { LiveExec, LocalExecInput } from './types.ts';

/**
 * Runs `argv` in its own process group (`detached`) for `LocalWorkspace.run`:
 * killed on the timeout or an abort, settled `KILL_GRACE_MS` after its
 * command exited while a background job holds the pipes (`linger`).
 */
export function spawnLocalExec(input: LocalExecInput): Promise<ExecResult> {
    const {
        argv,
        cwd,
        timeoutMs,
        options,
        env,
        clock,
        live,
        linger,
    } = input;

    return new Promise<ExecResult>((resolve, reject) => {
        const started = clock.now();
        const stdout = createOutputCollector(OUTPUT_MAX_BYTES);
        const stderr = createOutputCollector(OUTPUT_MAX_BYTES);
        const { signal } = options;

        let child: ChildProcess;

        try {
            child = spawn(argv[0] as string, argv.slice(1), {
                cwd,
                env,
                detached: true,
                stdio: 'pipe',
            });
        } catch (error) {
            reject(new SandboxError(`cannot start ${argv[0]}.`, { cause: error }));

            return;
        }

        let settled = false;
        let timedOut = false;
        let killTimer: ClockTimer | undefined;
        let graceTimer: ClockTimer | undefined;
        let pipeTimer: ClockTimer | undefined;

        const kill = () => {
            if (child.pid !== undefined) {
                killGroup(child.pid);
            }
        };
        const closePipes = () => {
            child.stdin?.destroy();
            child.stdout?.destroy();
            child.stderr?.destroy();
        };
        const finish = (): boolean => {
            if (settled) {
                return false;
            }

            settled = true;
            killTimer?.clear();
            graceTimer?.clear();
            pipeTimer?.clear();
            signal?.removeEventListener('abort', onAbort);
            live.delete(entry);

            return true;
        };
        const entry: LiveExec = {
            fail: (error) => {
                if (!finish()) {
                    return;
                }

                kill();
                closePipes();
                reject(error);
            },
        };
        function onAbort() {
            entry.fail(new SandboxError('exec aborted'));
        }
        const result = (exitCode: number, stderrText: string): ExecResult => ({
            exitCode,
            stdout: stdout.text(),
            stderr: stderrText,
            stdoutTruncated: stdout.truncated,
            stderrTruncated: stderr.truncated,
            timedOut,
            durationMs: clock.now() - started,
        });

        live.add(entry);
        signal?.addEventListener('abort', onAbort, { once: true });

        child.stdout?.on('data', (chunk: Uint8Array) => stdout.write(chunk));
        child.stderr?.on('data', (chunk: Uint8Array) => stderr.write(chunk));
        // a child that never reads its stdin closes the pipe (EPIPE)
        child.stdin?.on('error', () => undefined);
        child.stdin?.end(options.stdin ?? '');

        child.on('error', (error) => {
            // Handle only a command that could not start and has not settled.
            if (child.pid !== undefined || !finish()) {
                return;
            }

            closePipes();

            const code = errnoCode(error);

            if (code === 'ENOENT') {
                resolve(result(127, `${argv[0]}: command not found\n`));
            } else if (code === 'EACCES') {
                resolve(result(126, `${argv[0]}: permission denied\n`));
            } else {
                reject(new SandboxError(`cannot start ${argv[0]} (${code ?? 'unknown error'}).`, { cause: error }));
            }
        });

        child.on('exit', () => {
            if (settled || timedOut) {
                return;
            }

            // the command finished on its own: no timeout any more, but a
            // background job it started may run on and hold the pipes open
            killTimer?.clear();

            if (child.pid !== undefined) {
                linger(child.pid);
            }

            pipeTimer = clock.setTimeout(closePipes, KILL_GRACE_MS);
            pipeTimer.unref?.();
        });

        child.on('close', (code, closeSignal) => {
            if (!finish()) {
                return;
            }

            resolve(result(exitCodeOf(code, closeSignal), stderr.text()));
        });

        killTimer = clock.setTimeout(() => {
            timedOut = true;
            kill();
            // a process that left the group may hold the pipes open
            graceTimer = clock.setTimeout(closePipes, KILL_GRACE_MS);
            graceTimer.unref?.();
        }, timeoutMs);
        killTimer.unref?.();
    });
}
