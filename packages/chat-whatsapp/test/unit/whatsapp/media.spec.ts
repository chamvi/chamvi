/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { 
    afterEach, 
    beforeEach, 
    describe, 
    expect, 
    it, 
} from 'vitest';
import { getMediaKeys } from 'baileys';
import type { WAMessage } from 'baileys';
import { CHAT_REQUEST_ERROR_CODE } from '@chamvi/chat';
import { downloadWhatsAppMedia, whatsAppMediaError } from '../../../src/whatsapp/helpers/media.ts';
import type { WhatsAppMediaFetch, WhatsAppSocket  } from '../../../src/whatsapp/types.ts';

const MEDIA_KEY = randomBytes(32);

/** A voice note message pointing at `directPath`. */
function voiceNote(directPath = '/v/t62/secret-path'): WAMessage {
    return {
        key: {
            remoteJid: '491701234567@s.whatsapp.net', 
            id: 'ABC', 
            fromMe: false, 
        },
        message: {
            audioMessage: {
                url: 'https://mmg.whatsapp.net/secret-url',
                directPath,
                mediaKey: MEDIA_KEY,
                ptt: true,
            },
        },
    };
}

/** A media body as WhatsApp serves it: AES-256-CBC (PKCS#7) of `plain`, then the 10-byte MAC. */
async function encryptedBody(plain: Buffer): Promise<Buffer> {
    const {
        cipherKey, 
        iv, 
        macKey, 
    } = await getMediaKeys(MEDIA_KEY, 'audio');
    const cipher = createCipheriv('aes-256-cbc', cipherKey, iv);

    if (!macKey) {
        throw new Error('no mac key');
    }

    const cipherText = Buffer.concat([cipher.update(plain), cipher.final()]);
    const mac = createHmac('sha256', macKey).update(iv).update(cipherText).digest().subarray(0, 10);

    return Buffer.concat([cipherText, mac]);
}

/** A body of `bytes` in chunks of `size`, then optionally an error. */
function bodyOf(bytes: Buffer, size: number, failure?: Error): ReadableStream<Uint8Array> {
    let offset = 0;

    return new ReadableStream<Uint8Array>({
        pull(controller) {
            if (offset < bytes.byteLength) {
                controller.enqueue(new Uint8Array(bytes.subarray(offset, offset + size)));
                offset += size;

                return;
            }

            if (failure) {
                controller.error(failure);
            } else {
                controller.close();
            }
        },
    });
}

/** A fetch answering each call with the next response, recording the calls. */
function fakeFetch(...responses: (() => Response)[]) {
    const calls: {
        url: string; 
        signal: AbortSignal; 
        headers: Record<string, string> 
    }[] = [];
    const fetcher: WhatsAppMediaFetch = async (url, init) => {
        calls.push({ url, ...init });

        const next = responses[calls.length - 1];

        if (!next) {
            throw new Error('unexpected fetch');
        }

        return next();
    };

    return { fetcher, calls };
}

const SOCKET = {} as WhatsAppSocket;

describe('downloadWhatsAppMedia', () => {
    const uncaught: unknown[] = [];
    const record = (error: unknown) => {
        uncaught.push(error);
    };

    beforeEach(() => {
        uncaught.length = 0;
        process.on('uncaughtException', record);
        process.on('unhandledRejection', record);
    });

    afterEach(() => {
        process.off('uncaughtException', record);
        process.off('unhandledRejection', record);
    });

    it('fetches the direct path on the url host and decrypts the body, chunk boundaries anywhere', async () => {
        const plain = randomBytes(1000);
        const body = await encryptedBody(plain);
        const { fetcher, calls } = fakeFetch(() => new Response(bodyOf(body, 7)));

        const bytes = await downloadWhatsAppMedia(voiceNote(), SOCKET, { maxBytes: 4096 }, fetcher);

        expect(Buffer.from(bytes).equals(plain)).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0]?.url).toBe('https://mmg.whatsapp.net/v/t62/secret-path');
        expect(calls[0]?.headers.Origin).toBe('https://web.whatsapp.com');
        expect(calls[0]?.signal.aborted).toBe(true);
    });

    it('decrypts a body of exactly maxBytes whole', async () => {
        const plain = randomBytes(64);
        const body = await encryptedBody(plain);
        const { fetcher } = fakeFetch(() => new Response(bodyOf(body, 64)));

        const bytes = await downloadWhatsAppMedia(voiceNote(), SOCKET, { maxBytes: 64 }, fetcher);

        expect(Buffer.from(bytes).equals(plain)).toBe(true);
    });

    it('stops once more than maxBytes were decrypted, returns maxBytes + 1 bytes and aborts the fetch', async () => {
        const plain = randomBytes(64 * 1024);
        const body = await encryptedBody(plain);
        let pulled = 0;
        const stream = bodyOf(body, 1024);
        const reader = stream.getReader();
        const counted = new ReadableStream<Uint8Array>({
            async pull(controller) {
                const next = await reader.read();

                if (next.done) {
                    controller.close();

                    return;
                }

                pulled += next.value.byteLength;
                controller.enqueue(next.value);
            },
        });
        const { fetcher, calls } = fakeFetch(() => new Response(counted));

        const bytes = await downloadWhatsAppMedia(voiceNote(), SOCKET, { maxBytes: 3000 }, fetcher);

        expect(bytes.byteLength).toBe(3001);
        expect(Buffer.from(bytes).equals(plain.subarray(0, 3001))).toBe(true);
        expect(pulled).toBeLessThan(8 * 1024);
        expect(calls[0]?.signal.aborted).toBe(true);
    });

    it('rejects a body that errors mid-stream with the wrapped error and nothing unhandled', async () => {
        const body = await encryptedBody(randomBytes(4096));
        const { fetcher, calls } = fakeFetch(() => new Response(bodyOf(body.subarray(0, 1024), 256, new Error('socket reset at https://mmg.whatsapp.net/secret'))));

        const error = await downloadWhatsAppMedia(voiceNote(), SOCKET, { maxBytes: 8192 }, fetcher).catch((value: unknown) => value);

        // give a stray 'error' event or rejection the chance to surface
        await new Promise((resolve) => {
            setImmediate(resolve);
        });

        expect(error).toMatchObject({ code: CHAT_REQUEST_ERROR_CODE, message: 'Downloading the WhatsApp media failed.' });
        expect(JSON.stringify(error)).not.toContain('secret');
        expect(calls[0]?.signal.aborted).toBe(true);
        expect(uncaught).toEqual([]);
    });

    it.each([1000, 1024 + 10, 4096])('refuses a body cut after %i bytes instead of returning a short one', async (length) => {
        const body = await encryptedBody(randomBytes(4096));
        const { fetcher } = fakeFetch(() => new Response(bodyOf(body.subarray(0, length), 100)));

        await expect(downloadWhatsAppMedia(voiceNote(), SOCKET, { maxBytes: 8192 }, fetcher))
            .rejects.toMatchObject({ code: CHAT_REQUEST_ERROR_CODE });
    });

    it('refuses a body whose MAC does not match', async () => {
        const body = await encryptedBody(randomBytes(100));

        body.writeUInt8(body.readUInt8(body.byteLength - 1) ^ 1, body.byteLength - 1);

        const { fetcher } = fakeFetch(() => new Response(bodyOf(body, 100)));

        await expect(downloadWhatsAppMedia(voiceNote(), SOCKET, { maxBytes: 8192 }, fetcher))
            .rejects.toMatchObject({ code: CHAT_REQUEST_ERROR_CODE });
    });

    it('names only the status of a failed response', async () => {
        const { fetcher } = fakeFetch(() => new Response('denied', { status: 403 }));

        await expect(downloadWhatsAppMedia(voiceNote(), SOCKET, { maxBytes: 8192 }, fetcher))
            .rejects.toMatchObject({ message: 'Downloading the WhatsApp media failed (status 403).' });
    });

    it('renews an expired link once through updateMediaMessage', async () => {
        const plain = randomBytes(100);
        const body = await encryptedBody(plain);
        const { fetcher, calls } = fakeFetch(
            () => new Response('gone', { status: 410 }),
            () => new Response(bodyOf(body, 50)),
        );
        const renewals: WAMessage[] = [];
        const socket = {
            updateMediaMessage: async (message: WAMessage) => {
                renewals.push(message);

                return voiceNote('/v/t62/renewed');
            },
        } as unknown as WhatsAppSocket;

        const bytes = await downloadWhatsAppMedia(voiceNote(), socket, { maxBytes: 8192 }, fetcher);

        expect(Buffer.from(bytes).equals(plain)).toBe(true);
        expect(renewals).toHaveLength(1);
        expect(calls.map((call) => call.url)).toEqual([
            'https://mmg.whatsapp.net/v/t62/secret-path',
            'https://mmg.whatsapp.net/v/t62/renewed',
        ]);
    });

    it('does not renew without updateMediaMessage', async () => {
        const { fetcher, calls } = fakeFetch(() => new Response('gone', { status: 404 }));

        await expect(downloadWhatsAppMedia(voiceNote(), SOCKET, { maxBytes: 8192 }, fetcher))
            .rejects.toMatchObject({ message: 'Downloading the WhatsApp media failed (status 404).' });
        expect(calls).toHaveLength(1);
    });

    it('refuses a message without media', async () => {
        const { fetcher, calls } = fakeFetch();
        const message = { key: { id: 'X' }, message: { conversation: 'hi' } } as WAMessage;

        await expect(downloadWhatsAppMedia(message, SOCKET, { maxBytes: 8192 }, fetcher))
            .rejects.toMatchObject({ code: CHAT_REQUEST_ERROR_CODE });
        expect(calls).toHaveLength(0);
    });
});

describe('whatsAppMediaError', () => {
    it('names the status only, never the media url or the message', () => {
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
