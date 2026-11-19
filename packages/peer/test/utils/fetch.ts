/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** One request the fake saw, its body read as text. */
export type FakeRequest = {
    url: string;
    method: string;
    headers: Headers;
    body: string | undefined;
    redirect: RequestRedirect | undefined;
    signal: AbortSignal | undefined;
};

export type FakeHandler = (request: FakeRequest) => Response | Promise<Response>;

export type FakeFetch = {
    fetch: typeof fetch;
    requests: FakeRequest[];
    /** The request at `index`; throws when there is none. */
    at(index: number): FakeRequest;
};

async function readBody(body: BodyInit | null | undefined): Promise<string | undefined> {
    if (body === undefined || body === null) {
        return undefined;
    }

    return new Response(body).text();
}

/**
 * A fetch over `handler`. It follows a redirect itself (with the same headers)
 * unless the caller asked for `redirect: 'manual'`, as the platform fetch does,
 * so a test sees whether a token reached another origin.
 */
export function createFakeFetch(handler: FakeHandler): FakeFetch {
    const requests: FakeRequest[] = [];

    const run = async (url: string, init: RequestInit = {}): Promise<Response> => {
        init.signal?.throwIfAborted();

        const request: FakeRequest = {
            url,
            method: (init.method ?? 'GET').toUpperCase(),
            headers: new Headers(init.headers),
            body: await readBody(init.body),
            redirect: init.redirect,
            signal: init.signal ?? undefined,
        };

        requests.push(request);

        const response = await handler(request);
        const location = response.headers.get('location');

        if (response.status >= 300 && response.status < 400 && location && init.redirect !== 'manual') {
            return run(new URL(location, url).href, init);
        }

        return response;
    };

    return {
        fetch: ((input: string | URL | Request, init?: RequestInit) => run(input instanceof URL ? input.href : String(input), init)) as typeof fetch,
        requests,
        at(index) {
            const request = requests[index];

            if (!request) {
                throw new Error(`No request at ${index}.`);
            }

            return request;
        },
    };
}

/** A JSON answer. */
export function json(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...init.headers as Record<string, string> },
    });
}

/** A fetch that never answers until the request's signal aborts. */
export function hangingHandler(): FakeHandler {
    return (request) => new Promise<Response>((_, reject) => {
        request.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true });
    });
}
