/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AuthorizationCheckView } from '@chamvi/http';
import { isObject } from 'smob';
import { REQUEST_TIMEOUT_MS } from './constants.ts';
import { ApiError } from './error.ts';
import {
    pageQuery,
    path,
    runListQuery,
    toApiError,
    withQuery,
} from './helpers.ts';
import type {
    AgentIssueWire,
    AgentWire,
    ApiClientOptions,
    ArtifactWire,
    DocEntry,
    IApiClient,
    KvEntry,
    MeWire,
    RunDetail,
    RunPage,
    ScheduleWire,
    StartRunResult,
} from './types.ts';

type RequestOptions = {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    /** A fixed token: no refresh, no onUnauthorized (a pasted token being checked). */
    token?: string;
};

function dataOf<T>(body: unknown): T[] {
    return isObject(body) && Array.isArray(body.data) ? body.data as T[] : [];
}

/**
 * A signal for one request that aborts with the caller's `signal` or after
 * `ms` without an answer. `clear()` ends the deadline once the answer is
 * there, so a stream or a slow body is not cut off, while the caller's abort
 * keeps reaching it; `expired()` tells a timeout from the caller's abort.
 * Composed by hand: the browser target has no `AbortSignal.any()`.
 */
function withDeadline(signal: AbortSignal | undefined, ms: number) {
    const controller = new AbortController();
    let expired = false;
    const abort = () => controller.abort(signal?.reason);
    const timer = setTimeout(() => {
        expired = true;
        controller.abort();
    }, ms);

    signal?.addEventListener('abort', abort, { once: true });

    return {
        signal: controller.signal,
        expired: () => expired,
        clear: () => clearTimeout(timer),
    };
}

/**
 * The chamvi REST API from the browser: bearer token per request, JSON in
 * and out, every non-2xx answer an `ApiError`. A 401 asks `refresh` once
 * and retries when it answers `true`; a 401 that stands calls
 * `onUnauthorized`. A request without an answer within `timeoutMs` fails as
 * `ApiError` `timeout` (status 0).
 */
export function createApiClient(options: ApiClientOptions): IApiClient {
    const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
    const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

    async function send(target: string, init: RequestOptions, retried = false): Promise<Response> {
        const headers = new Headers(init.headers);

        if (!headers.has('accept')) {
            headers.set('accept', 'application/json');
        }

        const token = init.token ?? await options.token();

        if (token) {
            headers.set('authorization', `Bearer ${token}`);
        }

        let body: string | undefined;

        if (init.body !== undefined) {
            headers.set('content-type', 'application/json');
            body = JSON.stringify(init.body);
        }

        init.signal?.throwIfAborted();

        // bounds the wait for the answer only: without it a request the API never answers holds sign-in and startup
        const deadline = withDeadline(init.signal, timeoutMs);
        let response: Response;

        try {
            response = await doFetch(`${options.apiBase}${target}`, {
                method: init.method ?? 'GET',
                headers,
                body,
                signal: deadline.signal,
            });
        } catch (e) {
            if (deadline.expired()) {
                throw new ApiError(0, 'timeout', 'The API did not answer in time.');
            }

            throw e;
        } finally {
            deadline.clear();
        }

        if (response.ok) {
            return response;
        }

        if (response.status === 401 && init.token === undefined) {
            if (!retried && options.refresh && await options.refresh()) {
                return send(target, init, true);
            }

            const error = await toApiError(response);

            options.onUnauthorized?.();

            throw error;
        }

        throw await toApiError(response);
    }

    async function request<T>(target: string, init: RequestOptions = {}): Promise<T> {
        const response = await send(target, init);
        const text = await response.text();

        if (!text) {
            return undefined as T;
        }

        try {
            return JSON.parse(text) as T;
        } catch {
            throw new ApiError(response.status, 'invalid_response', 'The API answered no JSON.');
        }
    }

    return {
        me: (token) => request<MeWire>('/me', token === undefined ? {} : { token }),
        checkAuthorization: (names, token) => request<AuthorizationCheckView>('/authorization/check', {
            method: 'POST',
            body: names === undefined ? {} : { names: [...names] },
            ...(token === undefined ? {} : { token }),
        }),
        listAgents: async () => {
            const body = await request('/agents');

            return {
                data: dataOf<AgentWire>(body),
                issues: isObject(body) && Array.isArray(body.issues) ? body.issues as AgentIssueWire[] : [],
            };
        },
        listSchedules: async () => dataOf<ScheduleWire>(await request('/schedules')),
        listRuns: (filter) => request<RunPage>(withQuery('/runs', runListQuery(filter))),
        getRun: (id) => request<RunDetail>(path('runs', id)),
        cancelRun: async (id) => {
            await request(`${path('runs', id)}/cancel`, { method: 'POST' });
        },
        approve: async (id, body) => {
            await request(`${path('runs', id)}/approve`, { method: 'POST', body });
        },
        listKv: async (agent, page) => dataOf<KvEntry>(await request(withQuery(`${path('agents', agent)}/state/kv`, pageQuery(new URLSearchParams(), page)))),
        listDocs: async (agent, collection, page) => dataOf<DocEntry>(await request(withQuery(
            `${path('agents', agent)}/state/collections${path(collection)}`,
            pageQuery(new URLSearchParams(), page),
        ))),
        listArtifacts: async (id) => dataOf<ArtifactWire>(await request(`${path('runs', id)}/artifacts`)),
        readArtifact: async (id, artifactId, signal) => {
            const response = await send(`${path('runs', id)}/artifacts${path(artifactId)}`, { headers: { accept: '*/*' }, signal });

            return response.blob();
        },
        startRun: (agent, body) => request<StartRunResult>(`${path('agents', agent)}/runs`, { method: 'POST', body }),
        streamRun: (id, init) => send(`${path('runs', id)}/stream`, {
            headers: {
                accept: 'text/event-stream',
                ...(init.lastEventId === undefined ? {} : { 'last-event-id': String(init.lastEventId) }),
            },
            signal: init.signal,
        }),
        send: (target, init = {}) => send(target, init),
    };
}
