/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isClientError } from 'hapic';
import type { Response as HapicResponse, RequestOptions } from 'hapic';
import { ApiError } from '../error/module.ts';
import { asApiError, toApiError } from '../error/helpers.ts';
import type { APIRequestOptions, ApiTransport, BaseAPIContext } from './types.ts';
import { buildRequestConfig, withDeadline } from './utils.ts';

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/** A refused answer's body: a stream (a `stream`/`blob` call) is read as text, text is parsed as JSON when it is JSON. */
async function bodyOf(data: unknown): Promise<unknown> {
    if (data instanceof ReadableStream || data instanceof Blob) {
        try {
            return parseJson(await new Response(data).text());
        } catch {
            return undefined;
        }
    }

    return typeof data === 'string' ? parseJson(data) : data;
}

/**
 * The base of every domain API: one call through the client, bounded by
 * the answer deadline, every failure an `ApiError` (a caller's abort stays
 * the caller's abort reason).
 */
export class BaseAPI {
    protected readonly client: ApiTransport;

    constructor(context: BaseAPIContext) {
        this.client = context.client;
    }

    /** The raw hapic response of a 2xx answer (`data` decoded by `responseType`). */
    protected async requestRaw(config: RequestOptions, options: APIRequestOptions = {}): Promise<HapicResponse> {
        options.signal?.throwIfAborted();

        const extra = buildRequestConfig(options);
        const deadline = withDeadline(options.signal, options.timeout ?? this.client.timeoutMs);

        try {
            return await this.client.request({
                ...config,
                // joined here: hapic (ufo's withBase) skips a base the path already starts with (`/agents` + `/agents`)
                url: `${this.client.getBaseURL() ?? ''}${config.url}`,
                ...extra,
                headers: { ...Object.fromEntries(new Headers(config.headers)), ...Object.fromEntries(new Headers(extra.headers)) },
                signal: deadline.signal,
            });
        } catch (e) {
            if (deadline.expired()) {
                throw new ApiError(0, 'timeout', 'The API did not answer in time.');
            }

            if (options.signal?.aborted) {
                throw options.signal.reason;
            }

            if (isClientError(e) && e.response) {
                throw toApiError(e.response, await bodyOf(e.response.data));
            }

            throw asApiError(isClientError(e) && e.cause instanceof Error ? e.cause : e);
        } finally {
            deadline.clear();
        }
    }

    /** The decoded JSON of a 2xx answer, `undefined` for an empty one; `invalid_response` for any other body. */
    protected async request<T>(config: RequestOptions, options?: APIRequestOptions): Promise<T> {
        const response = await this.requestRaw({ ...config, responseType: 'text' }, options);
        const text = response.data;

        if (typeof text !== 'string' || text === '') {
            return undefined as T;
        }

        try {
            return JSON.parse(text) as T;
        } catch {
            throw new ApiError(response.status, 'invalid_response', 'The API answered no JSON.');
        }
    }
}
