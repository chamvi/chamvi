/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { Bash, decodeBytesToUtf8, stdoutAsBytes } from 'just-bash';
import { aggregateLimitMessage } from './helpers.ts';
import type { InterpreterJob, InterpreterOutcome } from './types.ts';

const failed = (message: string, cause: unknown): InterpreterOutcome => ({
    type: 'failed', 
    message, 
    cause: String(cause), 
});

async function run(job: InterpreterJob): Promise<InterpreterOutcome> {
    let bash: Bash;
    let result;

    try {
        bash = new Bash({
            cwd: '/workspace',
            files: job.files,
            commands: job.commands,
            executionLimitProfile: 'hardened',
            executionLimits: job.executionLimits,
        });
        result = await bash.exec(job.command);
    } catch (cause) {
        // A full guest filesystem is the command's failure, and the model can act on it.
        if (Error.isError(cause) && cause.message.startsWith('ENOSPC')) {
            return {
                type: 'completed',
                exitCode: 1,
                stdout: '',
                stderr: `${cause.message}\n`,
                outputs: [],
            };
        }

        return failed('File processing failed.', cause);
    }

    const completed = {
        type: 'completed' as const,
        exitCode: result.exitCode,
        stdout: decodeBytesToUtf8(stdoutAsBytes(result)),
        stderr: result.stderr,
        outputs: [] as Uint8Array[],
    };

    if (result.exitCode !== 0) {
        return completed;
    }

    let size = 0;

    for (const path of job.outputs) {
        let stat;

        try {
            stat = await bash.fs.lstat(`/workspace/${path}`);
        } catch (cause) {
            if (Error.isError(cause) && cause.message.includes('ENOENT')) {
                return { type: 'invalid', message: `Output ${path} does not exist.` };
            }

            return failed('Could not inspect file output.', cause);
        }

        if (!stat.isFile) {
            return { type: 'invalid', message: `Output ${path} is not a regular file.` };
        }

        size += stat.size;

        if (size > job.maxBytes) {
            return { type: 'invalid', message: aggregateLimitMessage(job.maxBytes) };
        }
    }

    try {
        for (const path of job.outputs) {
            completed.outputs.push(await bash.fs.readFileBuffer(`/workspace/${path}`));
        }
    } catch (cause) {
        return failed('Could not read file output.', cause);
    }

    return completed;
}

parentPort!.postMessage(await run(workerData as InterpreterJob));
