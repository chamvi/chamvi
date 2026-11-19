/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DispatchHost } from '../types.ts';

/**
 * A `serial(key, fn)`: runs `fn` after every earlier call under the same key
 * settled (in this process), whatever their outcome; a key's chain is dropped once idle.
 */
export function createDispatchSerial(): DispatchHost['serial'] {
    const chains = new Map<string, Promise<unknown>>();

    return (key, fn) => {
        const previous = chains.get(key) ?? Promise.resolve();
        const next = previous.then(fn, fn);
        const tail = next.catch(() => {});

        chains.set(key, tail);
        void tail.then(() => {
            if (chains.get(key) === tail) {
                chains.delete(key);
            }
        });

        return next;
    };
}
