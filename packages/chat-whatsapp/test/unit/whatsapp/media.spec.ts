/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { CHAT_REQUEST_ERROR_CODE } from '@chamvi/chat';
import { readBoundedMedia, whatsAppMediaError } from '../../../src/whatsapp/helpers/media.ts';

/** A stream of `chunks`. */
function chunked(...chunks: number[][]) {
    const stream = Readable.from(chunks.map((chunk) => Buffer.from(chunk)), { objectMode: false });

    return { stream };
}

describe('readBoundedMedia', () => {
    it('reads a stream within the bound whole', async () => {
        const { stream } = chunked([1, 2], [3]);

        expect(new Uint8Array(await readBoundedMedia(stream, 3))).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('stops once more than maxBytes arrived, destroys the stream and returns at most maxBytes + 1 bytes', async () => {
        // an endless body: the read only returns because it stops
        const stream = Readable.from((function* generate() {
            for (;;) {
                yield Buffer.from([1, 2]);
            }
        })(), { objectMode: false });

        const bytes = await readBoundedMedia(stream, 3);

        expect(bytes.byteLength).toBe(4);
        expect(stream.destroyed).toBe(true);
    });
});

describe('whatsAppMediaError', () => {
    it('names the status only, never the media url or the message', () => {
        // the shape of Baileys' Boom from getHttpStream
        const failure = Object.assign(new Error('Failed to fetch stream from https://mmg.whatsapp.net/secret-path'), {
            output: { statusCode: 410 },
            data: { mediaKey: 'secret-key' },
        });
        const error = whatsAppMediaError(failure);

        expect(error.code).toBe(CHAT_REQUEST_ERROR_CODE);
        expect(error.message).toBe('Downloading the WhatsApp media failed (status 410).');
        expect(JSON.stringify(error)).not.toContain('secret');
        expect(error.cause).toBeUndefined();
    });

    it('omits an unknown status', () => {
        expect(whatsAppMediaError(new Error('x')).message).toBe('Downloading the WhatsApp media failed.');
    });
});
