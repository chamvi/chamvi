/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    ApprovalWaitPoint,
    Invoker,
    Run,
    Usage,
} from '@chamvi/core-kit';
import type { IConversations } from '../../conversation/types.ts';
import type { EngineContext } from '../context/types.ts';
import type { DispatchEngineContext, ResumeRecord, ResumeStep } from '../dispatch/types.ts';
import type { SuspendRequest } from '../execute/types.ts';
import type { CancelReason } from '../registry/types.ts';
import type { IEngineRemote } from '../remote/caller/types.ts';
import type { IEnginePeerReceiver } from '../remote/receiver/types.ts';
import type {
    ApprovalAnswer,
    IEngine,
    WakeOutcome,
} from '../types.ts';

/** What `answer()` records: an `ApprovalAnswer` without its approval id. */
export type ApprovalDecisionInput = Omit<ApprovalAnswer, 'approvalId'>;

/** Answers, expiry, pauses and approval deliveries of waiting runs (internal). */
export interface IEngineApprovals {
    approve(runId: string, answer: ApprovalAnswer): Promise<void>;
    wake(runId: string, invoker: Invoker | undefined): Promise<WakeOutcome | undefined>;
    tick(): Promise<void>;
    answer(run: Run, waiting: ApprovalWaitPoint, decision: ApprovalDecisionInput, stale: () => Error): Promise<void>;
    resume(run: Run, waitId: string, record: ResumeRecord, step: ResumeStep, stale: () => Error): Promise<void>;
    pause(run: Run, request: SuspendRequest, usage: Usage): Promise<void>;
    deliverApproval(run: Run, waiting: ApprovalWaitPoint): Promise<void>;
}

/** What the approval delivery needs from the engine (internal). */
export type ApprovalDeliveryContext = Pick<
    EngineContext,
    'runService' | 'lockService' | 'clock' | 'claimTtlMs' | 'deliveryControllers' | 'emit' | 'onError' | 'isDraining' | 'getChannel'
>;

/** What EngineApprovals needs from the engine (internal). */
export type EngineApprovalsContext = ApprovalDeliveryContext & Pick<
    EngineContext,
    'stepService' | 'effectService' | 'owner' | 'executions' | 'deliveries' | 'isStarted'
> & {
    /** The conversation capability, when the engine has one. */
    conversations?: IConversations;
    remote?: Pick<IEngineRemote, 'wake' | 'pollWaits'>;
    peerReceiver?: Pick<IEnginePeerReceiver, 'onRunEvent'>;
    /** The engine: tick() lists the agents through its public listAgents(). */
    engine: Pick<IEngine, 'listAgents'>;
    /** Starts a scheduling pass. */
    pump(): Promise<void>;
    /** Settles a run nobody executes as cancelled. */
    cancelStored(runId: string, expectStatus: Run['status'][], reason?: CancelReason): Promise<void>;
    /** Updates a `running` run only while this engine holds its claim. */
    ownedUpdate(id: string, patch: Partial<Run>): Promise<Run | undefined>;
    dispatchContext(): DispatchEngineContext;
};
