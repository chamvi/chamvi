/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { SandboxError } from '@chamvi/core';
import type { ExecResult } from '../workspace/types.ts';
import { DISCOVERY_SCRIPT, INSTRUCTION_EXEC_TIMEOUT_MS } from './constants.ts';
import { DeadlineSignal } from './deadline.ts';
import type { DiscoveryExecContext } from './types.ts';

/** Runs the discovery script with `args`, bounded by the exec timeout, the request deadline and the caller's signal. */
export async function execDiscoveryScript(context: DiscoveryExecContext, args: string[]): Promise<ExecResult> {
    const {
        workspace,
        clock,
        signal,
        deadline,
        expiry,
    } = context;

    if (signal?.aborted) {
        throw new SandboxError('Repository instruction discovery aborted.');
    }

    const left = deadline - clock.now();

    if (left <= 0) {
        throw new DeadlineSignal();
    }

    const timeoutMs = Math.min(INSTRUCTION_EXEC_TIMEOUT_MS, left);
    const execDeadline = clock.now() + timeoutMs;
    const operation = new AbortController();
    const execSignal = AbortSignal.any(signal ?
        [signal, expiry.signal, operation.signal] : [expiry.signal, operation.signal]);

    // Bound the whole call, including credential refresh and a provider's transport grace.
    return new Promise<ExecResult>((resolve, reject) => {
        let settled = false;
        const timer = clock.setTimeout(() => operation.abort(), timeoutMs);

        timer.unref?.();

        const finish = () => {
            if (settled) {
                return false;
            }

            settled = true;
            timer.clear();
            execSignal.removeEventListener('abort', onAbort);

            return true;
        };
        function onAbort() {
            if (!finish()) {
                return;
            }

            if (signal?.aborted) {
                reject(new SandboxError('Repository instruction discovery aborted.'));
            } else if (expiry.signal.aborted || clock.now() >= deadline) {
                reject(new DeadlineSignal());
            } else {
                reject(new SandboxError('Repository instruction discovery timed out.'));
            }

            operation.abort();
        }
        execSignal.addEventListener('abort', onAbort, { once: true });

        let pending: Promise<ExecResult>;

        try {
            pending = workspace.exec(['/bin/sh', '-c', DISCOVERY_SCRIPT, 'sh', ...args], {
                cwd: '.',
                timeoutMs,
                signal: execSignal,
            });
        } catch (error) {
            pending = Promise.reject(error);
        }

        pending.then((response) => {
            if (settled) {
                return;
            }

            if (execSignal.aborted || clock.now() >= execDeadline) {
                onAbort();

                return;
            }

            if (finish()) {
                resolve(response);
            }
        }, (error: unknown) => {
            if (finish()) {
                reject(error);
            }
        });
    });
}
