/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BadRequestError, RequestEntityTooLargeError, UnsupportedMediaTypeError } from '@chamvi/errors';
import type { IAppEvent } from 'routup';
import type { ReadRequestBodyOptions } from '../types.ts';

/** `application/json` or a `+json` media type (parameters ignored). */
export function isJsonMediaType(contentType: string | null): boolean {
    if (!contentType) {
        return false;
    }

    const type = (contentType.split(';')[0] ?? '').trim().toLowerCase();

    return type === 'application/json' || /^[a-z0-9.+-]+\/[a-z0-9.+-]+\+json$/.test(type);
}

function bodyTooLarge(limit: number): RequestEntityTooLargeError {
    return new RequestEntityTooLargeError({ message: `The request body exceeds ${limit} bytes.` });
}

function bodyNotJson(): UnsupportedMediaTypeError {
    return new UnsupportedMediaTypeError({ message: 'The request body must be application/json.' });
}

/**
 * Discards the rest of a refused body, at most `max` bytes, so a keep-alive
 * connection can serve the next request; false when the body is longer
 * (or the read fails) and the connection must close instead.
 */
async function drainRefusedBody(reader: ReadableStreamDefaultReader<Uint8Array>, max: number): Promise<boolean> {
    let size = 0;

    try {
        for (;;) {
            const { done, value } = await reader.read();

            if (done) {
                return true;
            }

            size += value.byteLength;

            if (size > max) {
                await reader.cancel().catch(() => {});

                return false;
            }
        }
    } catch {
        return false;
    }
}

/**
 * Answers with `connection: close`: a refused body left unread would stall
 * the next request on a keep-alive connection.
 */
function closeAfterResponse(event: IAppEvent): void {
    event.response.headers.set('connection', 'close');
}

/**
 * Reads at most `limit` bytes; `json: false` throws 415 at the first
 * non-empty chunk. A refused body is drained (at most `limit` more bytes),
 * else the connection closes after the answer.
 */
export async function readBodyBytes(event: IAppEvent, limit: number, json: boolean): Promise<Uint8Array<ArrayBuffer>> {
    const { body } = event.request;

    if (!body) {
        return new Uint8Array(0);
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    for (;;) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        size += value.byteLength;

        if ((size > 0 && !json) || size > limit) {
            if (!await drainRefusedBody(reader, limit)) {
                closeAfterResponse(event);
            }

            throw json ? bodyTooLarge(limit) : bodyNotJson();
        }

        chunks.push(value);
    }

    return concatChunks(chunks, size);
}

function concatChunks(chunks: readonly Uint8Array[], size: number): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return bytes;
}

/**
 * Reads a channel request's body of at most `limit` bytes: a
 * `content-length` above it is refused unread, a body without one is read
 * until it passes the limit. A refusal is a RequestEntityTooLargeError (413);
 * the channel mount then closes the connection. Media-type checks stay with
 * the caller.
 */
export async function readRequestBody(request: Request, options: ReadRequestBodyOptions): Promise<Uint8Array<ArrayBuffer>> {
    const { limit } = options;
    const length = request.headers.get('content-length');

    if (length !== null && /^\d+$/.test(length) && Number(length) > limit) {
        throw bodyTooLarge(limit);
    }

    if (!request.body) {
        return new Uint8Array(0);
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    try {
        for (;;) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            size += value.byteLength;

            if (size > limit) {
                throw bodyTooLarge(limit);
            }

            chunks.push(value);
        }
    } catch (error) {
        await reader.cancel().catch(() => {});

        throw error;
    } finally {
        reader.releaseLock();
    }

    return concatChunks(chunks, size);
}

/**
 * 413 when `content-length` already exceeds `limit`; the body is left
 * unread, which the server discards itself.
 */
export function assertContentLength(event: IAppEvent, limit: number): void {
    const length = Number(event.request.headers.get('content-length'));

    if (Number.isFinite(length) && length > limit) {
        throw bodyTooLarge(limit);
    }
}

/**
 * Reads a JSON body of at most `limit` bytes: `undefined` when empty, 413
 * when too large, 415 for another media type, 400 when unparsable. The body
 * middleware calls it after authentication.
 */
export async function readJsonBody(event: IAppEvent, limit: number): Promise<unknown> {
    const { request } = event;

    assertContentLength(event, limit);

    const bytes = await readBodyBytes(event, limit, isJsonMediaType(request.headers.get('content-type')));

    if (bytes.byteLength === 0) {
        return undefined;
    }

    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new BadRequestError({ message: 'The request body is not valid JSON.' });
    }
}
