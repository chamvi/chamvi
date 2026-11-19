/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock } from '../../clock/index.ts';
import type { Run } from '@chamvi/store';
import type { Agent, RemoteAgent } from '../../agent/types.ts';
import type { IAgentRevisionService } from '../../agent-revision/types.ts';
import type { ILockService } from '../../lock/types.ts';
import type { IModelResolver, ModelRef } from '../../model/types.ts';
import type { IRunService } from '../../run/types.ts';
import type { EngineContext } from '../context/types.ts';
import type { IEngineSkills } from '../skills/types.ts';
import type { IEngine } from '../types.ts';

/** What a registry cancel stores on the run (`Run.error`). */
export type CancelReason = { code: string; message: string };

/** What the registry operations need from the engine. */
export type RegistryContext = {
    /** The revision markers, read and written under the `agents:<name>` lock. */
    agentRevisionService: Pick<IAgentRevisionService, 'findOne' | 'save' | 'delete'>;
    /** The `agents:<name>` lock. */
    lockService: Pick<ILockService, 'acquire' | 'release'>;
    runService: IRunService;
    clock: IClock;
    /** The lock is retried every claimTtlMs / 3. */
    claimTtlMs: number;
    cancel: (runId: string, reason: CancelReason) => Promise<void>;
    onError: (error: unknown, run?: Run) => void;
};

export type DropRevisionOptions = {
    /** The agent was registered on this engine (no replica may run it any more once its marker is gone). */
    registered: boolean;
    /** The revision this engine had it at (undefined for an agent without a revision or one not registered here). */
    revision?: string;
};

/** The live registry of an engine (internal): the maps every part reads by reference. */
export type EngineRegistryState = {
    /** The registered agents by name, in registration order. */
    agents: Map<string, Agent>;
    /** The revision each registered agent was loaded at; undefined for an agent without a revision. */
    revisions: Map<string, string | undefined>;
    /** The `formerRevision` each agent was registered with: a run stamped with it counts as current. */
    formerRevisions: Map<string, string>;
    /**
     * Agents a putAgent()/removeAgent() is replacing or removing, by the number
     * of operations in flight: a checked dispatch for them is refused (or its
     * run cancelled) until the registry operation finished.
     */
    replacing: Map<string, number>;
    /** Agents whose revision marker this engine is moving: none of their runs starts here meanwhile. */
    syncing: Set<string>;
    /** Agents removed here whose store cleanup is still to finish, with the revision they had. */
    removals: Map<string, string | undefined>;
};

/** The agent registry of an engine (internal). */
export interface IEngineRegistry {
    readonly state: EngineRegistryState;
    getAgent(name: string): Agent | undefined;
    listAgents(): Agent[];
    agentRevision(name: string): string | undefined;
    putAgent(agent: Agent, options?: PutAgentOptions): Promise<'added' | 'replaced' | 'unchanged'>;
    releaseRevision(name: string): Promise<string[] | undefined>;
    removeAgent(name: string): Promise<boolean>;
    dropAgent(name: string): Promise<boolean>;
    markReplacing(name: string): () => void;
    checkAgent(agent: Agent): void;
    assertRegistrable(agent: Agent, options?: { commit?: boolean }): void;
    assertRemoteAgent(agent: RemoteAgent): void;
    registryContext(): RegistryContext;
}

/** The options of putAgent(). */
export type PutAgentOptions = {
    revision?: string;
    formerRevision?: string;
    reload?: boolean;
    signal?: AbortSignal
};

/** What EngineRegistry needs from the engine (internal). */
export type EngineRegistryContext = Pick<
    EngineContext,
    'agentRevisionService' | 'lockService' | 'runService' | 'clock' | 'claimTtlMs' | 'onError' | 'emit' | 'getChannel' | 'peers'
> & {
    /** The default model of agents without one. */
    model?: ModelRef;
    /** Resolves string model refs. */
    models?: IModelResolver;
    skills: IEngineSkills;
    /** Whether the engine has the conversation capability. */
    hasConversations: boolean;
    /** The engine: putAgent() prepares through its public prepare(), so a subclass or a spy sees the call. */
    engine: Pick<IEngine, 'prepare'>;
    /** The signal of the current preparation controller (aborted by stop()). */
    preparationSignal(): AbortSignal;
    /** The engine's cancelRun() (a subclass may wrap it). */
    cancelRun(runId: string, reason?: CancelReason): Promise<void>;
};
