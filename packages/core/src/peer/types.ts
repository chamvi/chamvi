/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Invoker,
    RemoteApproval,
    RunStatusLiteral,
    Usage,
    WaitPoint,
} from '@chamvi/store';
import type { ArtifactInput } from '../artifact/types.ts';

/** What every peer request gets: the signal that aborts it. */
export type PeerRequestOptions = {
    signal: AbortSignal;
};

/** A remote run to start at a peer: the target, its input and the caller's lineage. */
export type PeerStartInput = {
    /** The agent at the peer. */
    agent: string;
    /** Its `agent.on()` role. */
    role: string;
    payload: unknown;
    attachments?: ArtifactInput[];
    /** The same key for every resend of one start, so the peer starts one run. */
    idempotencyKey: string;
    peer: {
        /** The local stand-in run, the target of the peer's wake-up ping. */
        standIn: string;
        /** The calling run: the stand-in's parent when it was dispatched, else the stand-in. */
        parent: {
            runId: string;
            agent: string;
            /** The calling run's depth (the stand-in adds no level): the peer's run gets `depth + 1`. */
            depth: number
        };
        /** Whether the caller is tainted; a tainted caller starts a tainted remote run. */
        taint: boolean;
        /** The original person's name, for display only (never a grant). */
        origin?: string;
    };
};

/** A remote run as a peer reports it to the app that started it. */
export type PeerRunView = {
    id: string;
    status: RunStatusLiteral;
    /** The kind of the run's wait point while it waits. */
    waiting?: WaitPoint['kind'];
    /** The approval pending in the run or below it. */
    approval?: Omit<RemoteApproval, 'notifiedAt'>;
    output?: unknown;
    error?: { code: string; message: string };
    tainted: boolean;
    usage: Usage;
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
