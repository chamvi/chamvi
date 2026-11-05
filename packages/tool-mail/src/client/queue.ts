/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Runs tasks one after another per key: imapflow holds one mailbox open per connection. */
export function createQueue() {
    const tails = new Map<string, Promise<unknown>>();

    return function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
        const previous = tails.get(key) ?? Promise.resolve();
        const result = previous.then(task, task);
        const tail = result.then(() => undefined, () => undefined);

        tails.set(key, tail);
        void tail.then(() => {
            if (tails.get(key) === tail) {
                tails.delete(key);
            }
        });

        return result;
    };
}
