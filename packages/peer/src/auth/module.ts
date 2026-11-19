/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/core';
import { isObject } from 'smob';
import { PeerRequestError } from '../errors/request.ts';
import { redact, retryAfterMsOf } from '../errors/helpers.ts';
import { PEER_TOKEN_REFRESH_MARGIN_MS } from './constants.ts';
import type {
    IPeerCredential,
    PeerAuthupOutgoing,
    PeerCredentialContext,
    PeerOutgoing,
} from './types.ts';

type CachedToken = {
    value: string;
    /** When authup said it expires, on the clock. */
    expiresAt: number;
};

function createAuthupCredential(options: PeerAuthupOutgoing['authup'], ctx: PeerCredentialContext): IPeerCredential {
    const endpoint = `${options.url.replace(/\/+$/, '')}/token`;
    let cached: CachedToken | undefined;

    const secrets = () => [options.clientSecret, ...(cached ? [cached.value] : [])];
    const describe = (message: string) => redact(`The authup token request of peer "${ctx.peer}" failed: ${message}`, secrets());
    const fail = (message: string, retryAfterMs?: number) => new PeerRequestError(describe(message), retryAfterMs);
    // a refused or broken answer (wrong client, secret or url): a resend gets the same answer
    const refuse = (message: string) => new ValidationError(describe(message));

    const request = async (signal: AbortSignal): Promise<CachedToken> => {
        const startedAt = ctx.clock.now();
        let response: Response;

        try {
            response = await ctx.fetch(endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    accept: 'application/json',
                },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: options.clientId,
                    client_secret: options.clientSecret,
                }),
                // the secret is in the body: never sent on to wherever a redirect points
                redirect: 'manual',
                signal,
            });
        } catch (error) {
            if (signal.aborted) {
                throw signal.reason;
            }

            throw fail(Error.isError(error) ? error.message : String(error));
        }

        if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);

            if (response.status !== 429 && response.status < 500) {
                // 400 and 401 (a wrong client or secret), any other 4xx and a redirect (status 0 for an opaque one)
                throw refuse(`status ${response.status}.`);
            }

            const retryAfterMs = response.status === 429 || response.status === 503 ?
                retryAfterMsOf(response.headers.get('retry-after'), ctx.clock.now()) :
                undefined;

            throw fail(`status ${response.status}.`, retryAfterMs);
        }

        const data: unknown = await response.json().catch(() => undefined);

        if (!isObject(data) || typeof data.access_token !== 'string' || data.access_token.length === 0) {
            throw refuse('the answer carries no access_token.');
        }

        const expiresIn = typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) && data.expires_in > 0 ?
            data.expires_in * 1000 :
            0;

        return { value: data.access_token, expiresAt: startedAt + expiresIn };
    };

    return {
        async token(signal) {
            if (cached && ctx.clock.now() < cached.expiresAt - PEER_TOKEN_REFRESH_MARGIN_MS) {
                return cached.value;
            }

            const next = await request(signal);

            cached = next;

            return next.value;
        },
        refreshable: true,
        invalidate() {
            cached = undefined;
        },
        secrets,
    };
}

/**
 * The credential of `outgoing`: a fixed bearer, or an authup client's token
 * fetched by client credentials and cached until 30 s before it expires.
 */
export function createPeerCredential(outgoing: PeerOutgoing, ctx: PeerCredentialContext): IPeerCredential {
    if ('authup' in outgoing) {
        return createAuthupCredential(outgoing.authup, ctx);
    }

    const { token } = outgoing;

    return {
        token: async () => token,
        refreshable: false,
        invalidate: () => undefined,
        secrets: () => [token],
    };
}
