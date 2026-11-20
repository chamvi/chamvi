/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run, Usage } from '@chamvi/store';
import type {
    Agent,
    ModelAgent,
    RemoteAgent,
    SimpleAgent,
} from '../../agent/types.ts';
import type { IConversations } from '../../conversation/types.ts';
import type { IModelResolver, ModelRef } from '../../model/types.ts';
import type { SkillContribution } from '../../skill/types.ts';
import type { EngineContext } from '../context/types.ts';
import type { IEngineConversations } from '../conversations/types.ts';
import type { DispatchEngineContext } from '../dispatch/types.ts';
import type { ExecuteContext, RemoteExecuteContext, SuspendRequest } from '../execute/types.ts';
import type { IEngineStartGuard } from '../guard/types.ts';
import type { RunQueue } from '../queue/module.ts';
import type { EngineRegistryState } from '../registry/types.ts';
import type { IEngineRemote } from '../remote/caller/types.ts';
import type { IEnginePeerReceiver } from '../remote/receiver/types.ts';
import type { IEngineSkills } from '../skills/types.ts';
import type { IEngine } from '../types.ts';

/** How a claimed run executes and settles on this engine (internal). */
export interface IEngineRunner {
    execute(run: Run, signal: AbortSignal): Promise<void>;
    executeContext(
        run: Run,
        agent: ModelAgent | SimpleAgent,
        skills: SkillContribution,
        signal: AbortSignal,
        conversation?: ExecuteContext['conversation'],
    ): ExecuteContext;
    executionUpdate(runId: string, patch: Partial<Run>): Promise<Run>;
    remoteExecuteContext(run: Run, agent: RemoteAgent, signal: AbortSignal): RemoteExecuteContext;
    guardedExecute(run: Run): Promise<void>;
    settleRun(id: string, patch: Partial<Run>): Promise<Run | undefined>;
    ownedUpdate(id: string, patch: Partial<Run>): Promise<Run | undefined>;
    ownsRun(id: string): Promise<boolean>;
    loseLease(id: string): void;
}

/** What EngineRunner needs from the engine (internal). */
export type EngineRunnerContext = Pick<
    EngineContext,
    'runService' | 'stepService' | 'checkpointService' | 'effectService' | 'artifactService' | 'stateService' |
    'clock' | 'owner' | 'peers' | 'executions' | 'provided' | 'emit' | 'onError' | 'detach'
> & {
    /** The engine an execution's tools see (ExecuteContext.engine). */
    engine: IEngine;
    /** The engine's execute() (a subclass may wrap it): guardedExecute() runs every claimed run through it. */
    execute(run: Run, signal: AbortSignal): Promise<void>;
    /** The engine's finish() (a subclass may wrap it): every settle of the runner goes through it. */
    finish(id: string, patch: Partial<Run>): Promise<Run | undefined>;
    /** The live registry, read by reference. */
    registry: Pick<EngineRegistryState, 'agents' | 'revisions'>;
    skills: IEngineSkills;
    /** The default model of agents without one. */
    model?: ModelRef;
    /** Resolves string model refs. */
    models?: IModelResolver;
    /** The conversation capability, when the engine has one. */
    conversations?: IConversations;
    conversationOperations: Pick<IEngineConversations, 'capability' | 'reconcile'>;
    queue: Pick<RunQueue, 'defer'>;
    guard: Pick<IEngineStartGuard, 'isCurrent' | 'replacedSince' | 'isStale'>;
    /** The checked-run fence, by run id (shared with intake, cancel and the start guard). */
    checkedRuns: Map<string, Agent>;
    remote?: Pick<IEngineRemote, 'cancelSettled'>;
    peerReceiver?: Pick<IEnginePeerReceiver, 'onRunEvent'>;
    /** Pauses a running run on a wait point. */
    pause(run: Run, request: SuspendRequest, usage: Usage): Promise<void>;
    dispatchContext(): DispatchEngineContext;
};
