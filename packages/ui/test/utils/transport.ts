/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ITransport, TransportRequest } from 'hapic';

export type RecordedRequest = {
    url: string;
    method: string;
    headers: Headers;
    body?: string;
    signal?: AbortSignal | null;
};

export type FakeAnswer = Response | ((request: RecordedRequest) => Response | Promise<Response>);

/** A hapic transport answering the queued responses in order and recording every request. */
export class FakeTransport implements ITransport {
    readonly requests: RecordedRequest[] = [];

    constructor(protected answers: FakeAnswer[] = []) {}

    async dispatch(input: TransportRequest): Promise<Response> {
        const request: RecordedRequest = {
            url: input.url,
            method: input.method ?? 'GET',
            headers: new Headers(input.headers),
            body: typeof input.body === 'string' ? input.body : undefined,
            signal: input.signal,
        };

        this.requests.push(request);

        const answer = this.answers.shift();

        if (!answer) {
            throw new Error(`no answer queued for ${request.method} ${request.url}`);
        }

        return typeof answer === 'function' ? answer(request) : answer;
    }
}
