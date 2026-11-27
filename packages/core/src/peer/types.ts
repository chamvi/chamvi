/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Invoker, PeerRunView, PeerStartInput } from '@chamvi/core-kit';

/** What every peer request gets: the signal that aborts it. */
export type PeerRequestOptions = {
    signal: AbortSignal;
};



/**
 * Talks to one peer. A rejection with a ValidationError is permanent,
 * anything else is retryable; a `retryAfterMs?: number` property on the
 * thrown error delays the next attempt.
 */
export interface IPeerTransport {
    start(input: PeerStartInput, opts: PeerRequestOptions): Promise<{ runId: string }>;
    read(runId: string, opts: PeerRequestOptions): Promise<PeerRunView>;
    cancel(runId: string, opts: PeerRequestOptions): Promise<void>;
    /** The content-free "check run X now" ping for a stand-in run at the peer. */
    wake(standInRunId: string, opts: PeerRequestOptions): Promise<void>;
}

/** How the engine treats one peer. */
export type PeerSettings = {
    /** The poll window of a remote wait (one read per window across replicas). */
    pollMs: number;
    /** Every result from this peer taints the run. */
    untrusted: boolean;
    /** Where this app announces approvals of runs the peer started (fixed in code). */
    approvals?: { channel: string; address: string };
    /** Whether this app can call the peer (start, read, cancel, wake). */
    outgoing: boolean;
};

/** The configured peers, by name (the agent-name rule). */
export interface IPeerResolver {
    /** Every configured peer's name (the engine checks each one's settings at construction). */
    names(): string[];
    has(name: string): boolean;
    settings(name: string): PeerSettings;
    transport(name: string): IPeerTransport;
    /** The peer a request's invoker authenticates as, if any. */
    recognize(invoker: Invoker | undefined): string | undefined;
    /** This app's own approval link, for the peer view and notifications. */
    approvalUrl?(ref: { runId: string; approvalId: string }): string | undefined;
}
