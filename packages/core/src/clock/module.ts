/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from './types.ts';

/** Wall time and the global timers; a timer holds the process until its `unref()` is called. */
export const systemClock: IClock = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => {
        const handle = setTimeout(fn, ms);

        return {
            clear: () => clearTimeout(handle),
            unref: () => {
                handle.unref?.();
            },
        };
    },
};
