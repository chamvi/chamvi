/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type Barrier = {
    /** Waits until `parties` callers arrived; once open, every later call passes at once. */
    arrive(): Promise<void>;
};

/** A one-shot barrier: the first `parties` arrivals wait for each other, later ones pass. */
export function createBarrier(parties: number): Barrier {
    const { promise, resolve } = Promise.withResolvers<void>();
    let arrived = 0;

    return {
        async arrive() {
            arrived += 1;

            if (arrived >= parties) {
                resolve();
            }

            await promise;
        },
    };
}
