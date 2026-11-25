/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Readable } from 'node:stream';
import { downloadMediaMessage } from 'baileys';
import type { WAMessage } from 'baileys';
import { SILENT_LOGGER } from '../constants.ts';
import type { WhatsAppMediaDownloadOptions, WhatsAppSocket } from '../types.ts';

/**
 * Reads a media stream up to `maxBytes`: once more arrived it stops,
 * destroys the stream and returns the first `maxBytes + 1` bytes, so the
 * caller's size check refuses it without the rest ever being read.
 */
export async function readBoundedMedia(stream: Readable, maxBytes: number): Promise<Uint8Array> {
    const chunks: Buffer[] = [];
    let total = 0;

    try {
        for await (const chunk of stream) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);

            chunks.push(buffer);
            total += buffer.byteLength;

            if (total > maxBytes) {
                break;
            }
        }
    } finally {
        stream.destroy();
    }

    const bytes = Buffer.concat(chunks);

    return total > maxBytes ? bytes.subarray(0, maxBytes + 1) : bytes;
}

/**
 * Downloads a media message's bytes through Baileys (default of
 * `WhatsAppChatOptions.downloadMedia`), as a stream read up to
 * `maxBytes + 1` bytes (`fileLength` is the sender's claim). An expired
 * media link is renewed through the socket's `updateMediaMessage`; nothing
 * is logged.
 */
export async function downloadWhatsAppMedia(
    message: WAMessage,
    socket: WhatsAppSocket,
    options: WhatsAppMediaDownloadOptions,
): Promise<Uint8Array> {
    const { updateMediaMessage } = socket;
    const stream = await downloadMediaMessage(
        message,
        'stream',
        {},
        updateMediaMessage ? { reuploadRequest: (value) => updateMediaMessage(value), logger: SILENT_LOGGER } : undefined,
    );

    return readBoundedMedia(stream, options.maxBytes);
}
