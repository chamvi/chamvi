/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConversationBinding, TriggerParent } from '@chamvi/store';
import type { Agent } from '../../agent/types.ts';
import type { DispatchResult } from '../../channel/types.ts';
import type { DispatchHost, PeerDispatchHost } from '../../dispatch/types.ts';
import type { PeerStartInput } from '../../peer/types.ts';
import type { EngineContext } from '../context/types.ts';
import type { DispatchEngineContext } from '../dispatch/types.ts';
import type { DispatchEnvelope } from '../types.ts';

/** How runs come in (internal): dispatch(), a peer's start, and the hosts tools dispatch through. */
export interface IEngineIntake {
    dispatch(envelope: DispatchEnvelope): Promise<DispatchResult>;
    dispatchPeer(envelope: DispatchEnvelope, fields: PeerStartInput['peer'] & { role: string }): Promise<DispatchResult>;
    createRun(
        envelope: DispatchEnvelope,
        parent?: TriggerParent,
        conversation?: ConversationBinding,
        taintSource?: string,
    ): Promise<DispatchResult>;
    createDispatchHost(): DispatchHost;
    createPeerDispatchHost(): PeerDispatchHost;
    dispatchContext(): DispatchEngineContext;
}

/** What EngineIntake needs from the engine (internal). */
export type EngineIntakeContext = Pick<
    EngineContext,
    'runService' | 'artifactService' | 'idempotencyService' | 'effectService' | 'lockService' | 'peers' |
    'clock' | 'claimTtlMs' | 'onError' | 'emit' | 'nextCreatedAt' | 'isStarted' | 'getAgent' | 'getChannel'
> & {
    /** The revision the registered agent was loaded at. */
    agentRevision(name: string): string | undefined;
    /** Whether a putAgent()/removeAgent() of the agent is in flight. */
    isReplacing(name: string): boolean;
    /** The checked-run fence, by run id (shared with the start guard). */
    checkedRuns: Map<string, Agent>;
    /** Cancels a run created for an agent object the registry no longer holds; never throws. */
    cancelReplaced(runId: string, name: string): Promise<void>;
    /** Starts a scheduling pass. */
    pump(): Promise<void>;
    resume: DispatchEngineContext['resume'];
    /** The engine's cancel (a subclass may wrap it). */
    cancel: DispatchEngineContext['cancel'];
};
