/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The queue key of a file: workspace ids are UUIDs, so no two workspaces share one. */
export function fileKey(workspaceId: string, path: string): string {
    return `${workspaceId}:${path}`;
}

/**
 * A queue per key: each call runs `fn` once every earlier call with the same
 * key settled. The AI SDK runs the tool calls of one step at once, so this
 * keeps two edits of one file from reading the same content.
 */
export function createKeyedQueue(): <T>(key: string, fn: () => Promise<T>) => Promise<T> {
    const tails = new Map<string, Promise<void>>();

    return <T>(key: string, fn: () => Promise<T>): Promise<T> => {
        const run = (tails.get(key) ?? Promise.resolve()).then(fn);
        const tail = run.then(() => undefined, () => undefined);

        tails.set(key, tail);
        tail.then(() => {
            if (tails.get(key) === tail) {
                tails.delete(key);
            }
        });

        return run;
    };
}
