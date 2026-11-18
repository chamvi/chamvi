/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { parseEventStream as parseStream } from 'hapic';
import type { SseEvent } from './types.ts';

/**
 * The events of a `text/event-stream` body, parsed by hapic. Read through
 * a reader: the browser target cannot iterate a `ReadableStream` itself.
 */
export async function* parseEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
    const reader = parseStream(body).getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                return;
            }

            yield value.lastEventId ? {
                event: value.type, 
                data: value.data, 
                id: value.lastEventId, 
            } : { event: value.type, data: value.data };
        }
    } finally {
        reader.releaseLock();
    }
}

/** A wait that resolves at once when the signal aborts. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) {
            resolve();

            return;
        }

        const timer = setTimeout(done, ms);
        function done(): void {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
        }
        signal.addEventListener('abort', done);
    });
}
