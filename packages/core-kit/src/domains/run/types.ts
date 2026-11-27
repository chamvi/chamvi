/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ApprovalOption } from '../approval/types.ts';
import type { ConversationBinding } from '../conversation/types.ts';
import type { TriggerEnvelope } from '../trigger/types.ts';
import type { RunStatus } from './constants.ts';

export type RunStatusLiteral = `${RunStatus}`;

export type Usage = {
    inputTokens: number;
    outputTokens: number;
};

export type RunTaint = { at: Date; source: string };

/** The approval a `waiting` run waits on, as approve() requested it. */
export type ApprovalWaitPoint = {
    kind: 'approval';
    /** The generic wait id, always equal to `approvalId` (a stored wait point without it reads back with it). */
    id: string;
    /** `<stepIndex>:<toolCallId>:<n>` of the stored checkpoint's pending call: never changes after the pause. */
    approvalId: string;
    toolName: string;
    toolCallId: string;
    title: string;
    body?: string;
    /** Safe channel notification instead of private approval arguments. */
    notification?: string;
    /** The run's artifact ids shown with the request; absent when none. */
    artifacts?: string[];
    /** The choices of the request; absent for a plain yes or no. */
    options?: ApprovalOption[];
    /** Set (true) only when several options may be selected. */
    multiple?: boolean;
    /** The channel the request is delivered through; none for the inbox and API only. */
    channel?: string;
    address?: string;
    /** The named delivery slot, if requested. */
    slot?: string;
    expiresAt: Date;
    /** Set once the approval message went out through `channel`; tick() re-sends while it is missing. */
    notifiedAt?: Date;
};

/** The dispatched runs a `waiting` run waits on to settle. */
export type DispatchWaitPoint = {
    kind: 'dispatch';
    /** `<stepIndex>:<toolCallId>:w<n>`: never changes after the pause. */
    id: string;
    toolName: string;
    toolCallId: string;
    /** The runs waited on, in the caller's order (duplicates allowed). */
    runIds: string[];
    expiresAt: Date;
};

/** An approval pending in a remote run or below it, as the last poll showed it. */
export type RemoteApproval = {
    /** The remote run that waits on the approval. */
    runId: string;
    approvalId: string;
    title: string;
    /** The owning app's own approval link. */
    url?: string;
    /** Set once the notification to the configured destination went out. */
    notifiedAt?: Date;
};

/** The run of another chamvi app a stand-in run waits on to settle. */
export type RemoteWaitPoint = {
    kind: 'remote';
    id: 'remote';
    /** The configured peer that owns the remote run. */
    peer: string;
    /** The remote agent's name on the peer. */
    agent: string;
    remoteRunId: string;
    expiresAt: Date;
    /** Set by a wake from the peer: the next tick polls at once. */
    wakeRequested?: boolean;
    /** The remote run as the last poll showed it. */
    remote?: {
        status: RunStatusLiteral;
        approval?: RemoteApproval;
    };
};

/** What a `waiting` run waits on, by `kind`. */
export type WaitPoint = ApprovalWaitPoint | DispatchWaitPoint | RemoteWaitPoint;

export type Run = {
    id: string;
    agent: string;
    status: RunStatusLiteral;
    /** First exposure to untrusted content; never cleared by execution. */
    taint?: RunTaint;
    trigger: TriggerEnvelope;
    concurrencyKey?: string;
    /** Where the run came from on its channel (`trigger.address`). */
    address?: string;
    output?: unknown;
    /**
     * Why the run failed, or why the registry cancelled it (`agent_replaced`,
     * `agent_removed`); a run cancelled on another replica keeps the reason
     * through the owner's settle, a run that completes anyway loses it.
     */
    error?: { code: string; message: string };
    usage: Usage;
    /** The sum of every descendant's usage, recomputed from the children (never incremented). */
    subtreeUsage?: Usage;
    /**
     * The run that dispatched this one (`trigger.parent.runId` of a
     * `dispatch` parent; a peer parent names another app's run and sets
     * none); set by the run service at create, never from the caller.
     */
    parentRunId?: string;
    waiting?: WaitPoint;
    claim?: { owner: string; expiresAt: Date };
    /**
     * Set by cancel() on a replica that does not execute the run: the owner
     * aborts it on its next poll, and a later execution settles it cancelled.
     */
    cancelRequested?: boolean;
    /**
     * The revision the agent was registered at when the run was created
     * (a folder agent's content hash); absent for an agent without one.
     */
    agentRevision?: string;
    /** The conversation the run belongs to; set by the trusted conversation intake only, never by dispatch(). */
    conversation?: ConversationBinding;
    createdAt: Date;
    updatedAt: Date;
    startedAt?: Date;
    finishedAt?: Date;
};
