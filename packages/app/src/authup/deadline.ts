/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITokenVerifier } from '@authup/server-adapter-kit';
import { TimeoutError } from '@chamvi/core';
import type { IClock } from '@chamvi/core';

/**
 * `run()`, or a `TimeoutError` once `timeoutMs` passed on `clock`. The call
 * is abandoned, not aborted (nothing upstream takes a signal); its late
 * outcome is swallowed and the timer is cleared as soon as it settles.
 */
export function withDeadline<T>(clock: IClock, timeoutMs: number, label: string, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const timer = clock.setTimeout(() => {
            if (settled) {
                return;
            }

            settled = true;
            reject(new TimeoutError(timeoutMs, `authup: the ${label} did not answer within ${timeoutMs}ms.`));
        }, timeoutMs);
        const settle = (fn: () => void) => {
            if (settled) {
                return;
            }

            settled = true;
            timer.clear();
            fn();
        };

        let pending: Promise<T>;

        try {
            pending = run();
        } catch (error) {
            settle(() => reject(error));

            return;
        }

        Promise.resolve(pending).then(
            (value) => settle(() => resolve(value)),
            (error: unknown) => settle(() => reject(error)),
        );
    });
}

/** The verifier with every verification bounded by `timeoutMs`. */
export function boundVerifier(verifier: ITokenVerifier, clock: IClock, timeoutMs: number): ITokenVerifier {
    return { verify: (token, options) => withDeadline(clock, timeoutMs, 'token verification', () => verifier.verify(token, options)) };
}
