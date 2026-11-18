/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent } from '../agent/types.ts';
import type { ArtifactInput, IArtifactService  } from '../artifact/types.ts';
import type { ChannelContext, IChannel } from '../channel/types.ts';
import type { IClock } from '../clock/index.ts';
import type { IContextProvider } from '../context/types.ts';
import type { ConversationInspection, ConversationOptions, IConversationService  } from '../conversation/types.ts';
import type {
    ConversationIdentity,
    ConversationScope,
    Invoker,
    Run,
    Step,
    TriggerEnvelope,
} from '@chamvi/store';
import type { IModelResolver, ModelRef } from '../model/types.ts';
import type { IPeerResolver } from '../peer/types.ts';
import type { SkillInput } from '../skill/types.ts';
import type { IAgentRevisionService } from '../agent-revision/types.ts';
import type { IConnectionService } from '../connection/types.ts';
import type { ICheckpointService } from '../checkpoint/types.ts';
import type { IEffectService } from '../effect/types.ts';
import type { IIdempotencyService } from '../idempotency/types.ts';
import type { ILockService } from '../lock/types.ts';
import type { IRunService } from '../run/types.ts';
import type { IStateService } from '../state/types.ts';
import type { IStepService } from '../step/types.ts';

/** Public engine contract; use Engine only for construction or extension. */
export interface IEngine extends IContextProvider {
    /** The rules of runs over the run repository. */
    readonly runService: IRunService;
    /** The steps of runs over the step repository. */
    readonly stepService: IStepService;
    /** The latest checkpoint of each run over the checkpoint repository. */
    readonly checkpointService: ICheckpointService;
    /** Recorded effect results over the effect repository. */
    readonly effectService: IEffectService;
    /** The files of runs over the artifact repository. */
    readonly artifactService: IArtifactService;
    /** Agent state over the key-value and document repositories. */
    readonly stateService: IStateService;
    /** The revision markers of folder agents over the agent revision repository. */
    readonly agentRevisionService: IAgentRevisionService;
    /** Leases on keys over the lock repository (keyed runs, admission, the registry, approval deliveries). */
    readonly lockService: ILockService;
    /** The idempotency keys of dispatches over the idempotency repository. */
    readonly idempotencyService: IIdempotencyService;
    /**
     * Connections over the connection repository, when the store keeps
     * them; the engine itself uses none, code that holds an engine
     * (`createHttpApp`) reads them through it.
     */
    readonly connectionService: IConnectionService | undefined;
    /**
     * Conversations over the conversation repository, when the store keeps
     * them; the conversation capability (`conversations`) needs it.
     */
    readonly conversationService: IConversationService | undefined;
    /** The configured peers remote agents run at, when the app has any. */
    readonly peers: IPeerResolver | undefined;
    readonly clock: IClock;
    readonly isDraining: boolean;

    dispatch(envelope: DispatchEnvelope): Promise<{ runId: string; deduplicated: boolean }>;
    inspectConversation(identity: ConversationIdentity, query?: { limit?: number; offset?: number }): Promise<ConversationInspection | undefined>;
    resetConversation(identity: ConversationIdentity, options?: { keepNotes?: boolean }): Promise<ConversationScope>;
    deleteConversation(identity: ConversationIdentity): Promise<void>;
    pruneConversations(): Promise<void>;
    getAgent(name: string): Agent | undefined;
    listAgents(): Agent[];
    channelContext(channel: IChannel): ChannelContext;
    getChannel(name: string): IChannel | undefined;
    listChannels(): IChannel[];
    agentRevision(name: string): string | undefined;
    putAgent(agent: Agent, options?: {
        revision?: string;
        formerRevision?: string;
        reload?: boolean;
        signal?: AbortSignal;
    }): Promise<'added' | 'replaced' | 'unchanged'>;
    removeAgent(name: string): Promise<boolean>;
    releaseRevision(name: string): Promise<string[] | undefined>;
    getRun(id: string): Promise<Run | undefined>;
    on<T extends EngineEvent['type']>(event: T, listener: (e: Extract<EngineEvent, { type: T }>) => void): () => void;
    prepare(options?: { signal?: AbortSignal; agents?: readonly Agent[] }): Promise<void>;
    start(options?: EngineStartOptions): Promise<void>;
    stop(): Promise<void>;
    recover(): Promise<number>;
    drain(options?: { timeoutMs?: number }): Promise<void>;
    idle(): Promise<void>;
    cancel(runId: string): Promise<void>;
    approve(runId: string, answer: ApprovalAnswer): Promise<void>;
    tick(): Promise<void>;
    checkAgent(agent: Agent): void;
}

/**
 * A piece of model output while it streams; never stored. `step` is the
 * checkpoint step index the step it belongs to is saved under.
 */
export type RunDelta = {
    runId: string;
    step: number;
    kind: 'text' | 'reasoning';
    text: string;
};

export type RunEvent = { type: 'run.updated'; run: Run } |
    { type: 'step.appended'; step: Step } |
    { type: 'run.delta'; delta: RunDelta };

/** An agent was added, replaced or removed on this engine; local like the run events. */
export type AgentChange = {
    type: 'agents.changed';
    name: string;
    kind: 'added' | 'replaced' | 'removed';
};

/**
 * The unsettled runs a registry change cancelled: a revision change or a
 * replaced agent without a revision (`agent_replaced`), a removal (`agent_removed`).
 * Emitted once per sweep, by the engine that swept (so once across replicas),
 * also with no run ids. `runIds` are the runs whose cancel went through,
 * which is a request for a run executing on another replica (it may still
 * complete before that replica sees it) or being drained here (it settles
 * `interrupted`).
 */
export type AgentRunsCancelled = {
    type: 'agents.cancelled';
    name: string;
    reason: 'agent_replaced' | 'agent_removed';
    /** The revision the agent was reloaded at (a folder agent's replacement only). */
    revision?: string;
    /** The runs whose cancel went through (cancelled, or a cancel requested; see above). */
    runIds: string[];
};

/** Every event Engine.on() delivers. */
export type EngineEvent = RunEvent | AgentChange | AgentRunsCancelled;

export type EngineOptions = {
    /** Runs: built on the same clock as the engine's (`clock`). */
    runService: IRunService;
    stepService: IStepService;
    checkpointService: ICheckpointService;
    effectService: IEffectService;
    artifactService: IArtifactService;
    stateService: IStateService;
    agentRevisionService: IAgentRevisionService;
    /** Leases: built on the same clock as the engine's (`clock`). */
    lockService: ILockService;
    /** Dispatch idempotency keys: built on the same clock as the engine's (`clock`). */
    idempotencyService: IIdempotencyService;
    /**
     * Connections, when the store keeps them (optional); the engine uses
     * none, it exposes the service to code that holds the engine. Its
     * fence reads the lock rows `lockService` writes.
     */
    connectionService?: IConnectionService;
    /**
     * Conversations, when the store keeps them (optional): required by the
     * conversation capability (`conversations`), built on the engine's
     * clock.
     */
    conversationService?: IConversationService;
    agents: Agent[];
    readonly skills?: readonly SkillInput[];
    /**
     * The channels runs come from and talk to; names unique. start() starts
     * them after the first recover, drain() and stop() stop them first.
     */
    channels?: IChannel<any, any>[];
    /**
     * The default model of agents without one; a string default is checked
     * through `models` at construction.
     */
    model?: ModelRef;
    /**
     * Resolves `'<provider>/<model id>'` strings. Registration (constructor,
     * putAgent) checks every string ref through it; without it a string ref is
     * an `InvalidAgentDefinitionError`.
     */
    models?: IModelResolver;
    /**
     * The peers remote agents run at; registration (constructor, putAgent)
     * refuses a remote agent whose peer it does not have, and any remote
     * agent without it (InvalidAgentDefinitionError).
     */
    peers?: IPeerResolver;
    /**
     * The conversation capability agents with `conversation: true` need: the
     * authorizer and the limits. Persistence comes from `conversationService`.
     */
    conversations?: ConversationOptions;
    /** Default `${hostname}-${pid}`. */
    owner?: string;
    /** Default 4. */
    concurrencyMaxRuns?: number;
    /** Default 60_000, renewed every ttl/3 while running. */
    claimTtlMs?: number;
    clock?: IClock;
    /** Receives errors that have no caller to throw to. Default console.error. */
    onError?: (error: unknown, run?: Run) => void;
};

/** A run to create; `parent` is no field: only the dispatch host (dispatch()) sets the lineage. */
export type DispatchEnvelope = Omit<TriggerEnvelope, 'id' | 'receivedAt' | 'attachments' | 'parent'> &
    Partial<Pick<TriggerEnvelope, 'id' | 'receivedAt'>> & {
        /** Files to start the run with; stored as artifacts of the run before it is created. */
        attachments?: ArtifactInput[];
        /**
         * The agent object the caller's permission check saw; never stored.
         * Another registered object for the name refuses the dispatch
         * (AgentReplacedError) before any store write; a replacement while
         * the run is created cancels that run (`agent_replaced`).
         */
        checked?: Agent;
    };

/** An answer to the run's current wait point (`Engine.approve()`). */
export type ApprovalAnswer = {
    /** Must equal `run.waiting.approvalId`, else InvalidRunStateError. */
    approvalId: string;
    approved: boolean;
    reason?: string;
    /** Who answered; recorded on the wait step (\`output.approver\`). */
    approver?: Invoker;
    /**
     * The chosen option ids of a wait point with options: exactly one for a
     * single choice, at least one for a multiple choice; none on a denial.
     */
    selected?: string[];
};

export type EngineStartOptions = {
    signal?: AbortSignal;
    /** Default true; false starts no channel (a one-shot job never starts schedules or sockets). */
    channels?: boolean;
};
