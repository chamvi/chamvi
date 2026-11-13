/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type CountingStream = {
    body: ReadableStream<Uint8Array>;
    /** How often the reader pulled a chunk. */
    reads(): number;
};

/**
 * An endless request body of `chunkSize` spaces per pull that counts the
 * pulls; `highWaterMark: 0` keeps the stream from pulling before a reader asks.
 */
export function countingStream(chunkSize: number): CountingStream {
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            reads++;
            controller.enqueue(new Uint8Array(chunkSize).fill(0x20));
        },
    }, { highWaterMark: 0 });

    return { body, reads: () => reads };
}
