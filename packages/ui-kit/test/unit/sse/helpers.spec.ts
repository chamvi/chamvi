/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { parseEventStream } from '../../../src/sse/helpers.ts';
import type { SseEvent } from '../../../src/sse/types.ts';
import { sse } from '../../utils/fetch.ts';

async function collect(chunks: string[]): Promise<SseEvent[]> {
    const events: SseEvent[] = await Array.fromAsync(parseEventStream(sse(chunks).body!));

    return events;
}

describe('parseEventStream', () => {
    it('parses events split across chunks', async () => {
        expect(await collect(['event: run.upd', 'ated\nda', 'ta: {"a":1}\n', '\nevent: ping\ndata:\n\n'])).toEqual([
            { event: 'run.updated', data: '{"a":1}' },
            { event: 'ping', data: '' },
        ]);
    });

    it('parses CRLF and multi-line data, and ignores comments', async () => {
        expect(await collect([': keep-alive\r\n\r\nevent: x\r\nid: 7\r\ndata: one\r\ndata: two\r\n\r\ndata: plain\n\n'])).toEqual([
            {
                event: 'x',
                data: 'one\ntwo',
                id: '7',
            },
            { event: 'message', data: 'plain' },
        ]);
    });

    it('decodes UTF-8 split inside a character', async () => {
        const bytes = new TextEncoder().encode('data: é\n\n');
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(bytes.slice(0, 7));
                controller.enqueue(bytes.slice(7));
                controller.close();
            },
        });
        const events: SseEvent[] = await Array.fromAsync(parseEventStream(body));

        expect(events).toEqual([{ event: 'message', data: 'é' }]);
    });
});
