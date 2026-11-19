/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '@chamvi/core';

/** A static bearer token: the secret of a static token principal at the peer. */
export type PeerTokenOutgoing = { token: string };

/** An authup client of the peer's realm: the bearer comes from client credentials at `<url>/token`. */
export type PeerAuthupOutgoing = {
    authup: {
        /** The authup server's URL. */
        url: string;
        clientId: string;
        clientSecret: string;
    };
};

/** How this app authenticates when it calls a peer. */
export type PeerOutgoing = PeerTokenOutgoing | PeerAuthupOutgoing;

/** What a credential needs besides its options. */
export type PeerCredentialContext = {
    /** The peer's name, for error messages. */
    peer: string;
    clock: IClock;
    fetch: typeof fetch;
};

/** The bearer of one peer's requests. */
export interface IPeerCredential {
    /** The bearer for the next request (an authup token cached on the clock). */
    token(signal: AbortSignal): Promise<string>;
    /** Whether a new token can be fetched (authup): a 401 is then retried once with a fresh one. */
    readonly refreshable: boolean;
    /** Forgets a token the peer refused (a 401), so the next request fetches a new one. */
    invalidate(): void;
    /** Every secret an error message must not show. */
    secrets(): string[];
}
