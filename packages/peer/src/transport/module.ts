/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import type {
    IClock,
    IPeerTransport,
    PeerRequestOptions,
    PeerRunView,
    PeerStartInput,
} from '@chamvi/core';
import { ApiError, Client } from '@chamvi/http-kit';
import type { APIRequestOptions, ClientOptions } from '@chamvi/http-kit';
import { isObject } from 'smob';
import type { IPeerCredential } from '../auth/types.ts';
import { PeerRequestError } from '../errors/request.ts';
import { redact, retryAfterMsOf } from '../errors/helpers.ts';
import { isRedirect, toAttachmentWire } from './helpers.ts';
import type { PeerTransportOptions } from './types.ts';

type HttpTransport = NonNullable<ClientOptions['transport']>;
type TransportRequest = Parameters<HttpTransport['dispatch']>[0];

/** Statuses the peer answers for a request that fails the same way when sent again (401: after the one authup retry). */
const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 409]);

/**
 * The codes of a 409 that a resend may pass: a storage conflict or deadlock,
 * an agent replaced during intake (a redeploy), a run state race.
 */
const RETRYABLE_CONFLICT_CODES = new Set(['entity_conflict', 'entity_deadlock', 'agent_replaced', 'invalid_run_state']);

/** The code of a redirect the transport refused to follow. */
const PEER_REDIRECT_CODE = 'peer_redirect';

/** A request URL outside the peer's origin. */
const PEER_ORIGIN_CODE = 'peer_origin';

/** Statuses whose `Retry-After` says when to send again. */
const RETRY_AFTER_STATUSES = new Set([429, 503]);

/**
 * The errors dispatch() made (a redirect, a URL off the origin): permanent.
 * Marked by instance, which passes http-kit unchanged; a code alone would also
 * match a peer's answer body, whose `code` http-kit copies into its ApiError.
 */
const TRANSPORT_ERRORS = new WeakSet<ApiError>();

function transportError(status: number, code: string, message: string): ApiError {
    const error = new ApiError(status, code, message);

    TRANSPORT_ERRORS.add(error);

    return error;
}

/**
 * Talks to one peer over `@chamvi/http-kit`: every request goes to the
 * peer's own origin with its bearer, never follows a redirect, and is aborted
 * by the caller's signal (the engine's deadline). A 400, 401, 403, 404, a
 * 409 of another code than a conflict, deadlock, replaced agent or run state
 * race, or a redirect is a permanent ValidationError (a misconfiguration a
 * resend does not fix); 429, those 409s, 5xx and network errors are a
 * retryable PeerRequestError.
 */
export class PeerTransport implements IPeerTransport {
    protected readonly name: string;

    protected readonly origin: string;

    protected readonly client: Client;

    protected readonly credential: IPeerCredential;

    protected readonly clock: IClock;

    protected readonly fetch: typeof fetch;

    constructor(options: PeerTransportOptions) {
        this.name = options.name;
        this.origin = new URL(options.url).origin;
        this.credential = options.credential;
        this.clock = options.clock;
        this.fetch = options.fetch;
        this.client = new Client({
            baseURL: options.url,
            transport: { dispatch: (request) => this.dispatch(request) },
        });
    }

    async start(input: PeerStartInput, opts: PeerRequestOptions): Promise<{ runId: string }> {
        const answer = await this.call((options) => this.client.agent.startRun(input.agent, {
            payload: input.payload,
            idempotencyKey: input.idempotencyKey,
            role: input.role,
            peer: input.peer,
            ...(input.attachments?.length ? { attachments: input.attachments.map(toAttachmentWire) } : {}),
        }, options), opts.signal);

        if (!isObject(answer) || typeof answer.runId !== 'string' || answer.runId.length === 0) {
            throw new ValidationError(`Peer "${this.name}" answered a start without a run id.`);
        }

        return { runId: answer.runId };
    }

    async read(runId: string, opts: PeerRequestOptions): Promise<PeerRunView> {
        const view: unknown = await this.call((options) => this.client.run.getPeerView(runId, options), opts.signal);

        if (!isObject(view) || typeof view.status !== 'string') {
            throw new ValidationError(`Peer "${this.name}" answered a malformed view of run "${runId}".`);
        }

        return view as PeerRunView;
    }

    async cancel(runId: string, opts: PeerRequestOptions): Promise<void> {
        await this.call((options) => this.client.run.cancel(runId, options), opts.signal);
    }

    async wake(standInRunId: string, opts: PeerRequestOptions): Promise<void> {
        await this.call((options) => this.client.run.wake(standInRunId, options), opts.signal);
    }

    /**
     * One API call with the bearer under `signal`; an abort rejects with the
     * signal's reason, any other failure is mapped. A 401 with an authup
     * token drops it and retries once with a fresh one.
     */
    protected async call<T>(fn: (options: APIRequestOptions) => Promise<T>, signal: AbortSignal): Promise<T> {
        signal.throwIfAborted();

        try {
            try {
                return await fn({ signal, token: await this.credential.token(signal) });
            } catch (error) {
                if (signal.aborted || !this.credential.refreshable || !(error instanceof ApiError) || error.status !== 401) {
                    throw error;
                }

                this.credential.invalidate();

                return await fn({ signal, token: await this.credential.token(signal) });
            }
        } catch (error) {
            if (signal.aborted) {
                throw signal.reason;
            }

            throw this.toError(error);
        }
    }

    protected toError(error: unknown): Error {
        // the credential's own failures (the authup token request) are mapped already
        if (error instanceof ValidationError || error instanceof PeerRequestError) {
            return error;
        }

        const secrets = this.credential.secrets();

        if (!(error instanceof ApiError)) {
            const message = Error.isError(error) ? error.message : String(error);

            return new PeerRequestError(redact(`The request to peer "${this.name}" failed: ${message}`, secrets));
        }

        const message = redact(
            error.status === 0 ?
                `The request to peer "${this.name}" failed (${error.code}): ${error.message}` :
                `Peer "${this.name}" answered ${error.status} ${error.code}: ${error.message}`,
            secrets,
        );

        const retryableConflict = error.status === 409 && RETRYABLE_CONFLICT_CODES.has(error.code);

        if ((PERMANENT_STATUSES.has(error.status) && !retryableConflict) || TRANSPORT_ERRORS.has(error)) {
            return new ValidationError(message);
        }

        if (RETRY_AFTER_STATUSES.has(error.status) && error.retryAfter !== undefined) {
            return new PeerRequestError(message, error.retryAfter * 1000);
        }

        return new PeerRequestError(message);
    }

    /**
     * hapic's transport: the request goes out only to the peer's origin and
     * never follows a redirect (`redirect: 'manual'`; a redirect is an error),
     * so the bearer reaches no other host. A `Retry-After` date is turned into
     * seconds on the clock, the form http-kit reads.
     */
    protected async dispatch(request: TransportRequest): Promise<Response> {
        // hapic's `proxy` is not supported: fetch ignores the key
        const { url, ...init } = request;

        // ApiErrors pass http-kit's mapping unchanged, so toError() finds the instance
        if (new URL(url).origin !== this.origin) {
            throw transportError(0, PEER_ORIGIN_CODE, 'the request left the peer\'s origin.');
        }

        const response = await this.fetch(url, { ...init, redirect: 'manual' });

        if (isRedirect(response)) {
            await response.body?.cancel().catch(() => undefined);

            throw transportError(response.status, PEER_REDIRECT_CODE, 'the peer answered with a redirect, which is not followed.');
        }

        const retryAfter = response.headers.get('retry-after');

        if (!RETRY_AFTER_STATUSES.has(response.status) || retryAfter === null || /^\s*\d+\s*$/.test(retryAfter)) {
            return response;
        }

        const headers = new Headers(response.headers);
        const ms = retryAfterMsOf(retryAfter, this.clock.now());

        if (ms === undefined) {
            headers.delete('retry-after');
        } else {
            headers.set('retry-after', String(Math.ceil(ms / 1000)));
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }
}
