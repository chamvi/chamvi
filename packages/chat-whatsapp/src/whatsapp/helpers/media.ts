/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';
import { CHAT_REQUEST_ERROR_CODE } from '@chamvi/chat';
import { ChamviError } from '@chamvi/core';
import {
    DEFAULT_ORIGIN,
    extractMessageContent,
    getContentType,
    getMediaKeys,
    getUrlFromDirectPath,
} from 'baileys';
import type { MediaType, WAMessage } from 'baileys';
import { isObject } from 'smob';
import type { WhatsAppMediaDownloadOptions, WhatsAppMediaFetch, WhatsAppSocket } from '../types.ts';

/** The AES block size: the cipher text is decrypted in whole blocks. */
const AES_BLOCK_SIZE = 16;

/** The MAC trailer of a media body: the first 10 bytes of HMAC-SHA256(macKey, iv + cipher text). */
const MEDIA_MAC_SIZE = 10;

/** The statuses of an expired media link, renewed once through the socket's `updateMediaMessage`. */
const MEDIA_EXPIRED_STATUSES = [404, 410];

/** Where a media message's encrypted bytes are and how to decrypt them (internal). */
type MediaSource = {
    url: string;
    mediaKey: Uint8Array | string;
    mediaType: MediaType;
};

/** The HTTP status a download failure carries, if any. */
function statusOfMediaError(error: unknown): number | undefined {
    return isObject(error) && isObject(error.output) && typeof error.output.statusCode === 'number' ?
        error.output.statusCode :
        undefined;
}

/**
 * A failed media download naming only the HTTP status: the media URL and the
 * message (media key included) never reach the error.
 */
export function whatsAppMediaError(error: unknown): ChamviError {
    const status = statusOfMediaError(error);

    return new ChamviError({
        code: CHAT_REQUEST_ERROR_CODE,
        message: `Downloading the WhatsApp media failed${status === undefined ? '' : ` (status ${status})`}.`,
    });
}

/** The host of a media url, if it parses. */
function hostOfMediaUrl(url: unknown): string | undefined {
    if (typeof url !== 'string' || url.length === 0) {
        return undefined;
    }

    try {
        return new URL(url).host;
    } catch {
        return undefined;
    }
}

/** The url, key and type of a media message, as Baileys' downloadMediaMessage reads them. */
function readMediaSource(message: WAMessage): MediaSource {
    const content = extractMessageContent(message.message);
    const type = content ? getContentType(content) : undefined;
    const media: unknown = content && type ? content[type] : undefined;

    if (!type || !isObject(media) || !media.mediaKey) {
        throw new Error('not a media message');
    }

    const { directPath, url } = media;
    const download = typeof directPath === 'string' && directPath.length > 0 ?
        getUrlFromDirectPath(directPath, hostOfMediaUrl(url)) :
        url;

    if (typeof download !== 'string' || download.length === 0) {
        throw new Error('no media url');
    }

    return {
        url: download,
        mediaKey: media.mediaKey as Uint8Array | string,
        mediaType: type.replace('Message', '') as MediaType,
    };
}

/**
 * Fetches and decrypts one media body (AES-256-CBC with PKCS#7 padding, then
 * the 10-byte MAC trailer) up to `maxBytes + 1` plaintext bytes. A body read
 * to its end must carry a matching MAC (Baileys checks none), so a truncated
 * or altered body is refused, never returned short. The body is read by
 * async iteration, so a body error rejects here and never becomes an
 * unhandled stream `'error'` (Baileys pipes the body, which forwards no
 * error); the fetch is aborted on every exit (a cut, an error, the end).
 */
async function fetchDecryptedMedia(
    source: MediaSource,
    maxBytes: number,
    fetcher: WhatsAppMediaFetch,
): Promise<Uint8Array> {
    const keys = await getMediaKeys(source.mediaKey, source.mediaType);
    const { macKey } = keys;

    if (!macKey) {
        throw new Error('no media mac key');
    }

    const controller = new AbortController();

    try {
        const response = await fetcher(source.url, { headers: { Origin: DEFAULT_ORIGIN }, signal: controller.signal });

        if (!response.ok || !response.body) {
            throw Object.assign(new Error('media request failed'), { output: { statusCode: response.status } });
        }

        const decipher = createDecipheriv('aes-256-cbc', keys.cipherKey, keys.iv);
        const mac = createHmac('sha256', macKey).update(keys.iv);
        const chunks: Buffer[] = [];
        let pending = Buffer.alloc(0);
        let total = 0;

        for await (const chunk of response.body) {
            const data = pending.byteLength > 0 ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
            const aligned = Math.floor(data.byteLength / AES_BLOCK_SIZE) * AES_BLOCK_SIZE;
            const cipherText = data.subarray(0, aligned);
            // the decipher holds the last block back until final(): what it returns is plaintext
            const plain = decipher.update(cipherText);

            mac.update(cipherText);
            pending = data.subarray(aligned);
            chunks.push(plain);
            total += plain.byteLength;

            if (total > maxBytes) {
                return Buffer.concat(chunks).subarray(0, maxBytes + 1);
            }
        }

        // the cipher text is whole blocks, so the remainder is the MAC trailer
        if (pending.byteLength !== MEDIA_MAC_SIZE || !timingSafeEqual(pending, mac.digest().subarray(0, MEDIA_MAC_SIZE))) {
            throw new Error('media mac mismatch');
        }

        // final() strips and checks the padding
        chunks.push(decipher.final());

        return Buffer.concat(chunks).subarray(0, maxBytes + 1);
    } finally {
        controller.abort();
    }
}

/**
 * Downloads a media message's bytes (default of
 * `WhatsAppChatOptions.downloadMedia`): Baileys' key derivation and url
 * rules, chamvi's own fetch and decrypt, bounded to `maxBytes + 1` plaintext
 * bytes (`fileLength` is the sender's claim). An expired link (404, 410) is
 * renewed once through the socket's `updateMediaMessage`, when it has one.
 * Nothing is logged; a failure is whatsAppMediaError().
 */
export async function downloadWhatsAppMedia(
    message: WAMessage,
    socket: WhatsAppSocket,
    options: WhatsAppMediaDownloadOptions,
    fetcher: WhatsAppMediaFetch = fetch,
): Promise<Uint8Array> {
    try {
        try {
            return await fetchDecryptedMedia(readMediaSource(message), options.maxBytes, fetcher);
        } catch (error) {
            const status = statusOfMediaError(error);

            if (!socket.updateMediaMessage || status === undefined || !MEDIA_EXPIRED_STATUSES.includes(status)) {
                throw error;
            }

            const renewed = await socket.updateMediaMessage(message);

            return await fetchDecryptedMedia(readMediaSource(renewed), options.maxBytes, fetcher);
        }
    } catch (error) {
        throw whatsAppMediaError(error);
    }
}
