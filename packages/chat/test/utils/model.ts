/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MockLanguageModelV4 } from 'ai/test';

function waitForAbort(signal: AbortSignal | undefined): Promise<never> {
    return new Promise((_resolve, reject) => {
        if (!signal) {
            return;
        }

        if (signal.aborted) {
            reject(signal.reason);

            return;
        }

        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
}

/** A model that never answers; its call rejects only once its abort signal fires. */
export function hangingModel() {
    return new MockLanguageModelV4({
        doGenerate: async (options) => waitForAbort(options.abortSignal),
        doStream: async (options) => waitForAbort(options.abortSignal),
    });
}
