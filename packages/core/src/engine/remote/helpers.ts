/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { RunStatus } from '@chamvi/store';
import type {
    RemoteApproval,
    RemoteWaitPoint,
    Run,
    RunStatusLiteral,
} from '@chamvi/store';
import type { IClock } from '../../clock/types.ts';
import { TimeoutError, ValidationError } from '../../errors/index.ts';
import { PEER_REQUEST_TIMEOUT_MS } from '../../peer/constants.ts';
import type { PeerRunView } from '../../peer/types.ts';
import type { RemoteOutcome, RemoteStartRecord } from './types.ts';

const OUTCOME_STATUSES: readonly string[] = ['completed', 'failed', 'cancelled', 'timeout'];

/** The effect key of a stand-in's start: its record holds the remote run id. */
export function remoteStartKey(runId: string): string {
    return `remote-start:${runId}`;
}

/** The effect key of a stand-in's recorded remote outcome. */
export function remoteWaitKey(runId: string): string {
    return `remote-wait:${runId}`;
}

/** A `waiting` run's remote wait point (undefined for any other run). */
export function remoteWaitOf(run: Run | undefined): RemoteWaitPoint | undefined {
    return run?.status === RunStatus.WAITING && run.waiting?.kind === 'remote' ? run.waiting : undefined;
}

/**
 * The key of the notification of a remote approval to a stand-in's fixed
 * `approvals` destination: `<runId>:remote:<remote run id>:<approvalId>`, the
 * remote run being the one that waits on the approval (the stand-in's own
 * remote run or one below it), so the channel's `out` dedupes a resend.
 */
export function remoteNotifyKey(runId: string, approval: Pick<RemoteApproval, 'runId' | 'approvalId'>): string {
    return `${runId}:remote:${approval.runId}:${approval.approvalId}`;
}

/** Whether `a` and `b` name the same remote approval (remote run and approval id). */
export function isSameApproval(
    a: Pick<RemoteApproval, 'runId' | 'approvalId'> | undefined,
    b: Pick<RemoteApproval, 'runId' | 'approvalId'> | undefined,
): boolean {
    if (!a || !b) {
        return a === b;
    }

    return a.runId === b.runId && a.approvalId === b.approvalId;
}

/**
 * The approval a peer's view shows pending (undefined without one), copied
 * field by field; a ValidationError for one that is not a remote approval
 * (non-empty `runId`, `approvalId`, `title`; `url` an http(s) URL).
 */
export function readViewApproval(view: PeerRunView): Omit<RemoteApproval, 'notifiedAt'> | undefined {
    const { approval } = view;

    if (approval === undefined) {
        return undefined;
    }

    const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

    if (
        !isObject(approval) ||
        !isText(approval.runId) ||
        !isText(approval.approvalId) ||
        !isText(approval.title) ||
        (approval.url !== undefined && (!isText(approval.url) || !/^https?:\/\//.test(approval.url) || !URL.canParse(approval.url)))
    ) {
        throw new ValidationError('The peer reported a malformed pending approval.');
    }

    return {
        runId: approval.runId,
        approvalId: approval.approvalId,
        title: approval.title,
        ...(approval.url !== undefined ? { url: approval.url } : {}),
    };
}

/**
 * The `remote` state of a wait point after a view of a remote run that has
 * not settled: its status and pending approval. A stored approval of the
 * same identity is kept as it is (its `notifiedAt`).
 */
export function nextRemoteState(
    stored: RemoteWaitPoint['remote'],
    status: RunStatusLiteral,
    approval: Omit<RemoteApproval, 'notifiedAt'> | undefined,
): NonNullable<RemoteWaitPoint['remote']> {
    const kept = approval && isSameApproval(stored?.approval, approval) ? stored?.approval : approval;

    return {
        status,
        ...(kept ? { approval: { ...kept } } : {}),
    };
}

/**
 * Settles `call` or rejects with `signal`'s reason once it aborts: a
 * transport that ignores the signal does not hold the caller.
 */
export async function untilAborted<T>(signal: AbortSignal, call: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();

    const aborted = new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });

    return Promise.race([Promise.try(call), aborted]);
}

/** The store lock of a stand-in's poll window. */
export function remotePollKey(runId: string): string {
    return `remote-poll:${runId}`;
}

/** A stored `remote-start:` record (undefined for a malformed one). */
export function readStartRecord(value: unknown): RemoteStartRecord | undefined {
    if (!isObject(value) || typeof value.runId !== 'string' || value.runId.length === 0) {
        return undefined;
    }

    return {
        runId: value.runId,
        ...(typeof value.peer === 'string' ? { peer: value.peer } : {}),
    };
}

/**
 * A stored `remote-wait:` record: undefined when nothing is recorded, a
 * ValidationError for a record that is not an outcome (it never settles a run).
 */
export function readOutcome(value: unknown): RemoteOutcome | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (
        !isObject(value) ||
        typeof value.status !== 'string' ||
        !OUTCOME_STATUSES.includes(value.status) ||
        typeof value.tainted !== 'boolean' ||
        !isObject(value.usage)
    ) {
        throw new ValidationError('The recorded remote outcome is malformed.');
    }

    return value as RemoteOutcome;
}

/** The outcome a settled remote run's view records; undefined while the remote run has not settled. */
export function outcomeOf(view: PeerRunView): RemoteOutcome | undefined {
    if (view.status !== RunStatus.COMPLETED && view.status !== RunStatus.FAILED && view.status !== RunStatus.CANCELLED) {
        return undefined;
    }

    return {
        status: view.status,
        ...(view.status === RunStatus.COMPLETED && view.output !== undefined ? { output: view.output } : {}),
        ...(view.error ? { error: { code: String(view.error.code), message: String(view.error.message) } } : {}),
        tainted: view.tainted === true,
        usage: {
            inputTokens: view.usage?.inputTokens ?? 0,
            outputTokens: view.usage?.outputTokens ?? 0,
        },
    };
}

/** The `retryAfterMs` a peer rejection carries (0 without one). */
export function retryAfterOf(error: unknown): number {
    if (!isObject(error) || typeof error.retryAfterMs !== 'number' || !Number.isFinite(error.retryAfterMs)) {
        return 0;
    }

    return Math.max(0, error.retryAfterMs);
}

/**
 * One request to a peer under `signal` and the request deadline
 * PEER_REQUEST_TIMEOUT_MS on `clock` (a TimeoutError). A transport that
 * ignores the signal does not hold the caller: the request is raced against it.
 */
export async function peerRequest<T>(
    clock: IClock,
    signal: AbortSignal,
    call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
    const deadline = new AbortController();
    const timer = clock.setTimeout(() => deadline.abort(new TimeoutError(
        PEER_REQUEST_TIMEOUT_MS,
        `The peer did not answer within ${PEER_REQUEST_TIMEOUT_MS}ms.`,
    )), PEER_REQUEST_TIMEOUT_MS);

    timer.unref?.();

    const combined = AbortSignal.any([signal, deadline.signal]);

    try {
        combined.throwIfAborted();

        const aborted = new Promise<never>((_, reject) => {
            combined.addEventListener('abort', () => reject(combined.reason), { once: true });
        });

        // Promise.try: a synchronous throw (a transport() for an unconfigured peer) still subscribes `aborted`
        return await Promise.race([Promise.try(() => call(combined)), aborted]);
    } finally {
        timer.clear();
    }
}
