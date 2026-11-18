/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClient as IBaseClient } from 'hapic';

/** A JSON-decoded value: every `Date` arrives as an ISO string. */
export type Wire<T> = T extends Date ? string :
    T extends ReadonlyArray<infer U> ? Wire<U>[] :
        T extends object ? { [K in keyof T]: Wire<T[K]> } :
            T;

/** The per-call options of every domain method. */
export type APIRequestOptions = {
    signal?: AbortSignal;
    /** How long this call waits for the answer, in ms; default the client's `timeoutMs`. */
    timeout?: number;
    /** A fixed bearer token: no refresh and no `onUnauthorized` (a pasted token being checked). */
    token?: string;
};

/** What a domain API needs of the client. */
export type ApiTransport = Pick<IBaseClient, 'request'> & { readonly timeoutMs: number };

export type BaseAPIContext = { client: ApiTransport };
