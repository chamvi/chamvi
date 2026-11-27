/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ArtifactInput } from '../artifact/types.ts';
import type {
    RemoteApproval,
    RunStatusLiteral,
    Usage,
    WaitPoint,
} from '../run/types.ts';

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
