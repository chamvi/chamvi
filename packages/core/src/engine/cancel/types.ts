/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamvi/core-kit';
import type { Agent } from '../../agent/types.ts';
import type { IConversations } from '../../conversation/types.ts';
import type { EngineContext } from '../context/types.ts';
import type { DispatchEngineContext } from '../dispatch/types.ts';
import type { CancelReason } from '../registry/types.ts';
import type { IEngineRemote } from '../remote/caller/types.ts';
import type { IEnginePeerReceiver } from '../remote/receiver/types.ts';

/** How runs are cancelled (internal): locally, in the store, or by a request to their owner. */
export interface IEngineCancel {
    cancel(runId: string): Promise<void>;
    cancelRun(runId: string, reason?: CancelReason): Promise<void>;
    cancelStored(runId: string, expectStatus: Run['status'][], reason?: CancelReason): Promise<void>;
    cancelReplaced(runId: string, name: string): Promise<void>;
}

/** What EngineCancel needs from the engine (internal). */
export type EngineCancelContext = Pick<EngineContext, 'runService' | 'clock' | 'executions' | 'emit' | 'onError'> & {
    /** The conversation capability, when the engine has one. */
    conversations?: IConversations;
    /** The checked-run fence, by run id (shared with intake and the start guard). */
    checkedRuns: Map<string, Agent>;
    /** The revision the registered agent was loaded at. */
    agentRevision(name: string): string | undefined;
    /** Reconciles a settled run's conversation. */
    reconcileConversation(run: Run): Promise<void>;
    remote?: Pick<IEngineRemote, 'cancelSettled'>;
    peerReceiver?: Pick<IEnginePeerReceiver, 'onRunEvent'>;
    dispatchContext(): DispatchEngineContext;
    /** The engine's cancelRun() (a subclass may wrap it): cancel() and cancelReplaced() go through it. */
    cancelRun(runId: string, reason?: CancelReason): Promise<void>;
};
