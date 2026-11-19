/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock, IPeerResolver, PeerSettings } from '@chamvi/core';
import type { PeerOutgoing } from '../auth/types.ts';

/**
 * How a peer's calls are recognized: the id of the static token principal it
 * uses here (a `CHAMVI_TOKENS` entry), or the authup client it signs in as.
 */
export type PeerIncoming = { token: string } | { authupClient: string };

/** One peer app. */
export type PeerOptions = {
    /** The peer's public URL: its origin plus its basePath. */
    url: string;
    /** How this app authenticates at the peer; without it this app cannot call the peer. */
    outgoing?: PeerOutgoing;
    /** How this app recognizes the peer's calls; without it the peer cannot call this app. */
    incoming?: PeerIncoming;
    /** The poll window of a remote run at the peer (default `PEER_POLL_DEFAULT_MS`, at least `PEER_POLL_MIN_MS`). */
    pollMs?: number;
    /** Every result from this peer taints the run (default false). */
    untrusted?: boolean;
    /** Where this app announces approvals of runs the peer started (fixed in code). */
    approvals?: { channel: string; address: string };
};

export type PeerResolverOptions = {
    /** The peers by name (the agent-name rule). */
    peers: Record<string, PeerOptions>;
    /** The clock of the authup token cache and of `Retry-After` dates. */
    clock: IClock;
    /** Default: the global `fetch`, looked up per request. */
    fetch?: typeof fetch;
    /** This app's own approval link, for the peer view and notifications. */
    approvalUrl?: IPeerResolver['approvalUrl'];
};

/** A peer's options after validation. */
export type PeerEntry = {
    name: string;
    /** The API base: the URL without trailing slashes. */
    url: string;
    outgoing?: PeerOutgoing;
    incoming?: PeerIncoming;
    settings: PeerSettings;
};
