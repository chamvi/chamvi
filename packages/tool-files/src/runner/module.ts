/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { extname } from 'node:path';
import { Worker } from 'node:worker_threads';
import { FILES_WORKER_GRACE_MS, FILES_WORKER_HEAP_MB } from '../tools/constants.ts';
import type {
    InterpreterJob,
    InterpreterLimits,
    InterpreterOutcome,
} from './types.ts';

// worker.ts beside this source under type stripping (tests), worker.mjs beside the built entry.
const WORKER_URL = new URL(`./worker${extname(import.meta.url)}`, import.meta.url);
const MAX_TIMER_MS = 2_147_483_647;

function killed(exitCode: number, stderr: string): InterpreterOutcome {
    return {
        type: 'completed',
        exitCode,
        stdout: '',
        stderr,
        outputs: [],
    };
}

/**
 * Runs one job on its own thread. The interpreter checks its limits only
 * between operations, so a single long operation would otherwise hold the
 * host event loop and every lease renewal on it; terminating the thread is
 * the only preemption there is.
 */
export function runInterpreter(job: InterpreterJob, { timeoutMs, signal }: InterpreterLimits): Promise<InterpreterOutcome> {
    return new Promise((resolve, reject) => {
        signal.throwIfAborted();

        const worker = new Worker(WORKER_URL, {
            name: 'chamvi-process-files',
            workerData: job,
            env: {},
            execArgv: [],
            resourceLimits: { maxOldGenerationSizeMb: FILES_WORKER_HEAP_MB },
        });
        let settled = false;

        // Settles only after the thread is gone, so drain never leaves one behind.
        const settle = (finish: () => void) => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            worker.terminate().then(finish, finish);
        };
        const onAbort = () => settle(() => reject(signal.reason));
        const timer = setTimeout(() => {
            settle(() => resolve(killed(124, `process_files: execution exceeded the ${timeoutMs} ms deadline.\n`)));
        }, Math.min(timeoutMs + FILES_WORKER_GRACE_MS, MAX_TIMER_MS));

        signal.addEventListener('abort', onAbort, { once: true });

        worker.once('message', (outcome: InterpreterOutcome) => settle(() => resolve(outcome)));
        worker.once('error', (cause: Error & { code?: string }) => {
            settle(() => resolve(cause.code === 'ERR_WORKER_OUT_OF_MEMORY' ?
                killed(137, `process_files: the interpreter exceeded its ${FILES_WORKER_HEAP_MB} MiB memory limit.\n`) :
                {
                    type: 'failed',
                    message: 'File processing failed.',
                    cause: String(cause),
                }));
        });
        worker.once('exit', (code) => {
            settle(() => resolve({
                type: 'failed',
                message: 'File processing failed.',
                cause: `The interpreter thread exited with code ${code}.`,
            }));
        });
    });
}
