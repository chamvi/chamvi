/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { hostname } from 'node:os';
import { pid } from 'node:process';
import type {
    Agent,
    ModelAgent,
    RemoteAgent,
    SimpleAgent,
} from '../agent/types.ts';
import { assertAgentKind, assertRemoteAgent, conversationKey } from '../agent/asserts.ts';
import { approvalDecisionKey, assertSelectionShape, toSelection } from '../approval/helpers.ts';
import { assertConcurrencyMaxRuns } from '../channel/concurrency.ts';
import { assertChannelName, assertDefaultAddress } from '../channel/helpers.ts';
import type {
    ChannelContext,
    DispatchResult,
    IChannel,
} from '../channel/types.ts';
import { Conversations } from '../conversation/module.ts';
import type {
    ConversationInspection,
    IConversationService, 
    IConversations, 
} from '../conversation/types.ts';
import type {
    ApprovalWaitPoint,
    ConversationBinding,
    ConversationIdentity,
    ConversationScope,
    Invoker,
    Run,
    Step,
    TriggerParent,
    Usage,
} from '@chamvi/store';
import { CLOCK_KEY } from '../clock/context.ts';
import { systemClock } from '../clock/index.ts';
import type { IClock } from '../clock/index.ts';
import { contextKeyName, isContextKey } from '../context/helpers.ts';
import type { ContextKey } from '../context/types.ts';
import {
    ChamviError,
    ChannelNotFoundError,
    ErrorCode,
    InvalidAgentDefinitionError,
    InvalidRunStateError,
    LeaseLostError,
} from '../errors/index.ts';
import { RunStatus } from '@chamvi/store';
import { deliverOnce } from './notify/module.ts';
import { DISPATCH_CONTEXT } from '../dispatch/constants.ts';
import type { DispatchHost } from '../dispatch/types.ts';
import { assertDispatchRoles, declaresDispatchRole } from '../dispatch/helpers/index.ts';
import { MODEL_CONTEXT } from '../model/constants.ts';
import { checkAgentModel, checkDefaultModel } from '../model/module.ts';
import type { IModelResolver, ModelContext, ModelRef } from '../model/types.ts';
import type { IPeerResolver, PeerStartInput } from '../peer/types.ts';
import { EngineSkills } from './skills/module.ts';
import type { IEngineSkills } from './skills/types.ts';
import type { SkillContribution } from '../skill/types.ts';
import type { IArtifactService } from '../artifact/types.ts';
import type { ICheckpointService } from '../checkpoint/types.ts';
import type { IEffectService } from '../effect/types.ts';
import type { IAgentRevisionService } from '../agent-revision/types.ts';
import type { IConnectionService } from '../connection/types.ts';
import type { IIdempotencyService } from '../idempotency/types.ts';
import type { ILockService } from '../lock/types.ts';
import type { IRunService } from '../run/types.ts';
import type { IStateService } from '../state/types.ts';
import type { IStepService } from '../step/types.ts';
import { toInvoker } from '../trigger/helpers.ts';
import { APPROVAL_TIMED_OUT } from './constants.ts';
import { EngineCancel } from './cancel/module.ts';
import type { IEngineCancel } from './cancel/types.ts';
import { createEngineContext } from './context/module.ts';
import type { EngineContext } from './context/types.ts';
import { EngineConversations } from './conversations/module.ts';
import type { IEngineConversations } from './conversations/types.ts';
import { isSameWaitPoint, toRunError, toWaitPoint } from './execute/helpers/index.ts';
import { executeSimpleRun } from './execute/simple.ts';
import { executeRun } from './execute/module.ts';
import { executeRemoteRun } from './execute/remote/module.ts';
import { EngineIntake } from './intake/module.ts';
import type { IEngineIntake } from './intake/types.ts';
import { EngineLifecycle } from './lifecycle/module.ts';
import type { IEngineLifecycle } from './lifecycle/types.ts';
import { EngineRemote } from './remote/caller/module.ts';
import type { IEngineRemote } from './remote/caller/types.ts';
import { EnginePeerReceiver } from './remote/receiver/module.ts';
import type { IEnginePeerReceiver } from './remote/receiver/types.ts';
import type { RemoteEngineContext } from './remote/types.ts';
import type { ExecuteContext, RemoteExecuteContext, SuspendRequest } from './execute/types.ts';
import {
    answerDispatchWait,
    healCancelCascade,
    healDispatchWaits,
    onRunSettled,
} from './dispatch/module.ts';
import type { DispatchEngineContext, ResumeRecord, ResumeStep } from './dispatch/types.ts';
import { RunQueue } from './queue/module.ts';
import { agentCancelReason } from './registry/helpers.ts';
import {
    cancelAgentRuns,
    claimRevision,
    dropRevision,
    releaseRevision,
    syncRevision,
} from './registry/module.ts';
import type { CancelReason, RegistryContext } from './registry/types.ts';
import type {
    ApprovalAnswer,
    DispatchEnvelope,
    EngineEvent,
    EngineOptions,
    EngineStartOptions,
    IEngine,
    WakeOutcome,
} from './types.ts';

/** What `answer()` records: an `ApprovalAnswer` without its approval id. */
type ApprovalDecisionInput = Omit<ApprovalAnswer, 'approvalId'>;

export class Engine implements IEngine {
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

    /** Leases on keys over the lock repository. */
    readonly lockService: ILockService;

    /** Connections over the connection repository, when the store keeps them (unused by the engine). */
    readonly connectionService: IConnectionService | undefined;

    /** Conversations over the conversation repository, when the store keeps them (the conversation capability needs it). */
    readonly conversationService: IConversationService | undefined;

    /** The idempotency keys of dispatches over the idempotency repository. */
    readonly idempotencyService: IIdempotencyService;

    /** The configured peers remote agents run at (EngineOptions.peers). */
    readonly peers: IPeerResolver | undefined;

    protected readonly agents: Map<string, Agent>;

    /** The revision each registered agent was loaded at; undefined for an agent without a revision. */
    protected readonly revisions = new Map<string, string | undefined>();

    /** The `formerRevision` each agent was registered with: a run stamped with it counts as current. */
    protected readonly formerRevisions = new Map<string, string>();

    /**
     * The agent object each checked dispatch of this engine saw, by run id
     * (memory only, never stored): a queued run whose agent was replaced
     * since is cancelled at admission, whatever the clock read. Removed when
     * the run starts or is cancelled here; a failed cancel keeps it.
     */
    protected readonly checkedRuns = new Map<string, Agent>();

    /** Cancels of queued runs stamped with a replaced revision, by run id; idle() waits for them. */
    protected readonly staleCancels = new Map<string, Promise<void>>();

    /**
     * Agents a putAgent()/removeAgent() is replacing or removing, by the number
     * of operations in flight: a checked dispatch for them is refused (or its
     * run cancelled) until the registry operation finished.
     */
    protected readonly replacing = new Map<string, number>();

    /** Agents whose revision marker this engine is moving: none of their runs starts here meanwhile. */
    protected readonly syncing = new Set<string>();

    /** Agents removed here whose store cleanup is still to finish, with the revision they had. */
    protected readonly removals = new Map<string, string | undefined>();

    /** The registered channels by name, in registration order. */
    protected readonly channels: Map<string, IChannel<any, any>>;

    protected readonly owner: string;

    /** Every time-based decision of the engine; packages built on it share it. */
    readonly clock: IClock;

    protected readonly queue: RunQueue;

    protected readonly conversations?: IConversations;

    protected readonly claimTtlMs: number;

    /** The default model of agents without one (EngineOptions.model). */
    protected readonly model?: ModelRef;

    /** Resolves string model refs (EngineOptions.models). */
    protected readonly models?: IModelResolver;

    protected readonly onError: (error: unknown, run?: Run) => void;

    /** Runs executing in this process, by id (the context's map). */
    protected readonly executions: EngineContext['executions'];

    /** Detached approval deliveries and peer requests (the context's set); idle() and drain() wait for them. */
    protected readonly deliveries: EngineContext['deliveries'];

    protected readonly deliveryControllers: EngineContext['deliveryControllers'];

    /** The caller side of remote agents (polls, wakes, timeouts, remote approvals and cancels); only with peers. */
    protected readonly remote?: IEngineRemote;

    /** The receiver side: signals to the peer that started a run here; only with peers. */
    protected readonly peerReceiver?: IEnginePeerReceiver;

    /** Values tools reach through inject(ctx, key), by reference (the context's map). */
    protected readonly provided: EngineContext['provided'];

    /** What the parts of this engine share. */
    protected readonly context: EngineContext;

    /** dispatch(), a peer's start and the dispatch hosts. */
    protected readonly intake: IEngineIntake;

    /** cancel() and the cancels of the registry and the start guard. */
    protected readonly cancellation: IEngineCancel;

    /** The conversation operations and channel contexts. */
    protected readonly conversationOperations: IEngineConversations;

    /** Preparation, start, stop, recovery and drain. */
    protected readonly lifecycle: IEngineLifecycle;

    protected readonly skills: IEngineSkills;

    constructor(opts: EngineOptions) {
        this.skills = new EngineSkills(opts.skills);
        this.runService = opts.runService;
        this.stepService = opts.stepService;
        this.checkpointService = opts.checkpointService;
        this.effectService = opts.effectService;
        this.artifactService = opts.artifactService;
        this.stateService = opts.stateService;
        this.agentRevisionService = opts.agentRevisionService;
        this.lockService = opts.lockService;
        this.idempotencyService = opts.idempotencyService;
        this.connectionService = opts.connectionService;
        this.conversationService = opts.conversationService;

        if (opts.conversations !== undefined) {
            if (!opts.conversationService) {
                throw new InvalidAgentDefinitionError('Conversations need a conversation service.');
            }

            this.conversations = new Conversations(
                opts.conversations,
                opts.conversationService,
                opts.runService,
                opts.effectService,
            );
        }

        this.agents = new Map(opts.agents.map((a) => [a.name, a]));

        const channels = opts.channels ?? [];

        this.channels = new Map();

        for (const channel of channels) {
            assertChannelName(channel.name);
            assertDefaultAddress(channel);

            if (this.channels.has(channel.name)) {
                throw new InvalidAgentDefinitionError(`The channel "${channel.name}" is registered more than once.`);
            }

            this.channels.set(channel.name, channel);
        }

        this.owner = opts.owner ?? `${hostname()}-${pid}`;
        this.clock = opts.clock ?? systemClock;
        this.claimTtlMs = opts.claimTtlMs ?? 60_000;
        this.peers = opts.peers;
        this.context = createEngineContext({
            runService: this.runService,
            stepService: this.stepService,
            checkpointService: this.checkpointService,
            effectService: this.effectService,
            artifactService: this.artifactService,
            stateService: this.stateService,
            agentRevisionService: this.agentRevisionService,
            lockService: this.lockService,
            idempotencyService: this.idempotencyService,
            connectionService: this.connectionService,
            conversationService: this.conversationService,
            peers: this.peers,
            clock: this.clock,
            owner: this.owner,
            claimTtlMs: this.claimTtlMs,
            // forwards the arguments as given: a caller's onError(error) stays a one-argument call
            onError: (...args) => this.onError(...args),
            isStarted: () => this.lifecycle.isStarted(),
            isDraining: () => this.lifecycle.isDraining(),
            getAgent: (name) => this.agents.get(name),
            getChannel: (name) => this.channels.get(name),
        });
        this.executions = this.context.executions;
        this.deliveries = this.context.deliveries;
        this.deliveryControllers = this.context.deliveryControllers;
        this.provided = this.context.provided;

        if (this.agents.size !== opts.agents.length) {
            const seen = new Set<string>();
            const duplicate = opts.agents.find((a) => seen.size === seen.add(a.name).size);
            throw new InvalidAgentDefinitionError(`Agent name "${duplicate?.name}" is used more than once.`);
        }

        this.model = opts.model;
        this.models = opts.models;
        checkDefaultModel({ model: this.model, models: this.models });

        // set directly: the key is module-private, so no provide() can collide
        this.provided.set(MODEL_CONTEXT, {
            model: this.model,
            models: this.models,
            agentModel: (name: string) => this.agents.get(name)?.definition.model,
        } satisfies ModelContext);

        this.provided.set(CLOCK_KEY, this.clock);
        this.intake = new EngineIntake({
            ...this.context,
            agentRevision: (name) => this.revisions.get(name),
            isReplacing: (name) => this.replacing.has(name),
            checkedRuns: this.checkedRuns,
            cancelReplaced: (runId, name) => this.cancellation.cancelReplaced(runId, name),
            pump: () => this.queue.pump(),
            resume: (run, waitId, record, step, stale) => this.resume(run, waitId, record, step, stale),
            cancel: (runId, reason) => this.cancelRun(runId, reason),
        });
        this.provided.set(DISPATCH_CONTEXT, this.createDispatchHost());

        if (opts.peers) {
            const remoteContext: RemoteEngineContext = {
                ...this.dispatchContext(),
                lockService: this.context.lockService,
                effectService: this.context.effectService,
                peers: opts.peers,
                getAgent: this.context.getAgent,
                getChannel: this.context.getChannel,
                detach: this.context.detach,
                peerEvent: (run) => this.peerReceiver?.onRunEvent(run),
            };

            this.remote = new EngineRemote(remoteContext);
            this.peerReceiver = new EnginePeerReceiver(remoteContext);
        }

        for (const agent of opts.agents) {
            this.assertRegistrable(agent);
        }

        // eslint-disable-next-line no-console
        this.onError = opts.onError ?? ((error) => console.error('[chamvi]', error));

        this.queue = new RunQueue({
            lockService: this.context.lockService,
            runService: this.context.runService,
            getAgent: this.context.getAgent,
            clock: this.context.clock,
            owner: this.context.owner,
            concurrencyMaxRuns: opts.concurrencyMaxRuns ?? 4,
            claimTtlMs: this.context.claimTtlMs,
            execute: (run) => this.guardedExecute(run),
            onError: (error, run) => this.onError(error, run),
            onRunUpdated: (run) => this.context.emit({ type: 'run.updated', run }),
            onPoll: async () => {
                await this.tick();
                await this.recover();
            },
            onLeaseLost: (runId) => this.loseLease(runId),
            prepareStart: () => this.prepareStart(),
            beforeList: () => this.pruneCheckedRuns(),
        });
        this.cancellation = new EngineCancel({
            ...this.context,
            conversations: this.conversations,
            checkedRuns: this.checkedRuns,
            agentRevision: (name) => this.revisions.get(name),
            reconcileConversation: (run) => this.conversationOperations.reconcile(run),
            remote: this.remote,
            peerReceiver: this.peerReceiver,
            dispatchContext: () => this.dispatchContext(),
            cancelRun: (runId, reason) => this.cancelRun(runId, reason),
        });
        this.conversationOperations = new EngineConversations({
            ...this.context,
            conversations: this.conversations,
            engine: this,
            dispatch: (envelope) => this.dispatch(envelope),
            createRun: (envelope, parent, conversation) => this.intake.createRun(envelope, parent, conversation),
            retryDeferred: () => this.queue.retryDeferred(),
            pump: () => this.queue.pump(),
        });
        this.lifecycle = new EngineLifecycle({
            ...this.context,
            queue: this.queue,
            skills: this.skills,
            conversations: this.conversations,
            staleCancels: this.staleCancels,
            engine: this,
            listAgents: () => this.agents.values().toArray(),
            listChannels: () => Array.from(this.channels.values()),
        });
    }


    async dispatch(envelope: DispatchEnvelope): Promise<{ runId: string; deduplicated: boolean }> {
        return this.intake.dispatch(envelope);
    }


    /**
     * Starts a run a peer asked for (a stand-in run of another chamvi app
     * waits on it): the peer is the one `peers.recognize(envelope.invoker)`
     * names, the target is the agent's `agent.on()` role `fields.role`,
     * checked like a local cross-agent dispatch (`from` lists
     * `<peer>/<parent.agent>`, the peer's `chamvi_agent_run`, `maxDepth`,
     * the schema, `maxPerRun` per peer and calling run, a required
     * idempotency key); a refusal writes nothing (an unknown or ungranted
     * agent: AgentNotFoundError, else ValidationError). The run gets a `peer`
     * parent (no parentRunId) and, for a tainted caller, taint `peer:<peer>`.
     */
    async dispatchPeer(envelope: DispatchEnvelope, fields: PeerStartInput['peer'] & { role: string }): Promise<DispatchResult> {
        return this.intake.dispatchPeer(envelope, fields);
    }


    /**
     * dispatch()'s body; `parent` comes only from this argument (the
     * dispatch host or the peer host), never from the envelope, and so does
     * `taintSource` (a peer parent's initial taint, ignored for any other).
     */
    protected async createRun(
        envelope: DispatchEnvelope,
        parent?: TriggerParent,
        conversation?: ConversationBinding,
        taintSource?: string,
    ): Promise<{ runId: string; deduplicated: boolean }> {
        return this.intake.createRun(envelope, parent, conversation, taintSource);
    }

    /** Privileged in-process operator APIs; audit run/checkpoint copies survive deletion. */
    inspectConversation(identity: ConversationIdentity, query?: { limit?: number; offset?: number }): Promise<ConversationInspection | undefined> {
        return this.conversationOperations.inspect(identity, query);
    }

    async resetConversation(identity: ConversationIdentity, options: { keepNotes?: boolean } = {}): Promise<ConversationScope> {
        return this.conversationOperations.reset(identity, options);
    }

    async deleteConversation(identity: ConversationIdentity): Promise<void> {
        return this.conversationOperations.delete(identity);
    }

    pruneConversations(): Promise<void> {
        return this.conversationOperations.prune();
    }

    /**
     * The internal host dispatch() reaches through inject(): the only
     * path that sets a run's parent.
     */
    protected createDispatchHost(): DispatchHost {
        return this.intake.createDispatchHost();
    }

    /**
     * Provides `value` (by reference, never cloned, stored or serialized) to
     * every execution's tools, tools factory and effect hooks through
     * inject(ctx, key); also after start(). Refuses a key not made by this
     * copy's defineContextKey(), `undefined` and a second value for one key.
     */
    provide<T>(key: ContextKey<T>, value: T): void {
        const name = contextKeyName(key);

        if (!isContextKey(key)) {
            throw new InvalidAgentDefinitionError(
                `Context "${name}" has no key from defineContextKey() of the engine's @chamvi/core: ` +
                'a key from another copy of @chamvi/core (a package that resolved its own) is refused.',
            );
        }

        if (value === undefined) {
            throw new InvalidAgentDefinitionError(`Context "${name}" needs a value.`);
        }

        if (this.provided.has(key)) {
            throw new InvalidAgentDefinitionError(`Context "${name}" is already provided.`);
        }

        this.provided.set(key, value);
    }

    /** Synchronous live registry lookup; no loading, creation or I/O. Missing agents return undefined. */
    getAgent(name: string): Agent | undefined {
        return this.agents.get(name);
    }

    /** The registered agents in registration order, as a new array. */
    listAgents(): Agent[] {
        return this.agents.values().toArray();
    }

    /** Gives a transport a context for the exact registered channel object. */
    channelContext(channel: IChannel): ChannelContext {
        return this.conversationOperations.channelContext(channel);
    }

    /** The registered channel of that name. */
    getChannel(name: string): IChannel | undefined {
        return this.channels.get(name);
    }

    /** The registered channels in registration order, as a new array. */
    listChannels(): IChannel[] {
        return Array.from(this.channels.values());
    }

    /** The revision the registered agent was loaded at (undefined for an agent without a revision). */
    agentRevision(name: string): string | undefined {
        return this.revisions.get(name);
    }

    /**
     * Registers an agent, or replaces the one of the same name in place (a new
     * one goes last). With a `revision` (a folder agent's content hash) the
     * store's revision marker is brought to it under the lock `agents:<name>`:
     * a changed marker cancels the agent's unsettled runs created before the
     * change, once across replicas. Without one, replacing a registered agent
     * cancels its unsettled runs created before now. Emits `agents.changed`,
     * except for the same agent at the same revision (`unchanged`).
     *
     * With `reload: false` (a process that never reloads, e.g. a job) nothing
     * is cancelled: a missing marker is written, a different one moved only
     * while the agent has no unsettled run, else InvalidRunStateError and the
     * agent stays unregistered.
     *
     * A marker at `formerRevision` (the same content hashed by an earlier
     * algorithm) counts as equal: it is moved to `revision` and nothing is
     * cancelled, so a hash change of the loader never cancels runs.
     *
     * `signal` cancels preparation and prevents registry mutation. Once a
     * registry operation starts, it finishes with local publication even if
     * the caller or engine stops, keeping registration and durable state aligned.
     */
    async putAgent(
        agent: Agent,
        options: {
            revision?: string;
            formerRevision?: string;
            reload?: boolean;
            signal?: AbortSignal
        } = {},
    ): Promise<'added' | 'replaced' | 'unchanged'> {
        this.assertRegistrable(agent);
        await this.prepare({ agents: [agent], signal: options.signal });

        const preparationSignal = AbortSignal.any([this.lifecycle.preparationSignal(), ...(options.signal ? [options.signal] : [])]);

        preparationSignal.throwIfAborted();

        const { name } = agent;
        const {
            revision,
            formerRevision,
            reload = true,
        } = options;
        const registered = this.agents.has(name);

        if (registered && this.agents.get(name) === agent && this.revisions.get(name) === revision) {
            return 'unchanged';
        }

        // a replacement of a registered agent: checked dispatches for it are refused until it is published
        const release = registered ? this.markReplacing(name) : undefined;

        try {
            let cancelled: string[] | undefined;

            if (revision !== undefined) {
                this.syncing.add(name);

                try {
                    if (reload) {
                        cancelled = await syncRevision(this.registry(), name, revision, formerRevision);
                    } else {
                        await claimRevision(this.registry(), name, revision, formerRevision);
                    }
                } finally {
                    this.syncing.delete(name);
                }
            } else if (registered && reload) {
                cancelled = await cancelAgentRuns(this.registry(), name, agentCancelReason(name, 'replaced'), new Date(this.clock.now()));
            }

            if (cancelled) {
                this.emit({
                    type: 'agents.cancelled',
                    name,
                    reason: 'agent_replaced',
                    ...(revision !== undefined && { revision }),
                    runIds: cancelled,
                });
            }

            // Finish a registry operation already started, keeping its marker and local publication consistent.
            const kind = this.agents.has(name) ? 'replaced' : 'added';

            this.agents.set(name, agent);
            this.revisions.set(name, revision);

            if (formerRevision !== undefined) {
                this.formerRevisions.set(name, formerRevision);
            } else {
                this.formerRevisions.delete(name);
            }

            this.emit({
                type: 'agents.changed',
                name,
                kind,
            });

            return kind;
        } finally {
            release?.();
        }
    }

    /**
     * For an agent this engine holds without a revision (an agent passed in
     * code): a stored revision marker of its name is left from a folder or
     * package agent of an earlier deployment, so it is cleared as a revision
     * change under the lock `agents:<name>`: its unsettled runs are cancelled
     * (`agent_replaced`) and the marker deleted; emits `agents.cancelled`.
     * Without a marker, or for an agent held at a revision or not held,
     * nothing happens. Resolves the cancelled run ids, or undefined.
     */
    async releaseRevision(name: string): Promise<string[] | undefined> {
        // not while a putAgent of the name is in flight: it may publish a revision whose marker this would delete
        const eligible = () => this.agents.has(name) && this.revisions.get(name) === undefined &&
            !this.replacing.has(name) && !this.syncing.has(name);

        if (!eligible()) {
            return undefined;
        }

        const cancelled = await releaseRevision(this.registry(), name, eligible);

        if (cancelled) {
            this.emit({
                type: 'agents.cancelled',
                name,
                reason: 'agent_replaced',
                runIds: cancelled,
            });
        }

        return cancelled;
    }

    /**
     * Removes an agent: first from this engine (no further dispatch, emits
     * `agents.changed`), then from the store's view under the lock
     * `agents:<name>`: with a stored revision marker (also one this engine
     * never loaded) all its unsettled runs are cancelled and the marker
     * deleted, unless this engine had the agent at another revision (a newer
     * one registered elsewhere); without a marker, the runs of an agent
     * registered here are cancelled. Resolves whether it was registered here.
     */
    async removeAgent(name: string): Promise<boolean> {
        const release = this.markReplacing(name);

        try {
            return await this.dropAgent(name);
        } finally {
            release();
        }
    }

    /** removeAgent()'s body, while the name is marked as being replaced. */
    protected async dropAgent(name: string): Promise<boolean> {
        const registered = this.agents.has(name);

        if (registered) {
            this.removals.set(name, this.revisions.get(name));
            this.agents.delete(name);
            this.revisions.delete(name);
            this.formerRevisions.delete(name);
            this.emit({
                type: 'agents.changed',
                name,
                kind: 'removed',
            });
        }

        const pending = this.removals.has(name);
        const cancelled = await dropRevision(this.registry(), name, {
            registered: pending,
            ...(pending && { revision: this.removals.get(name) }),
        });

        this.removals.delete(name);

        if (cancelled) {
            this.emit({
                type: 'agents.cancelled',
                name,
                reason: 'agent_removed',
                runIds: cancelled,
            });
        }

        return registered;
    }

    /** Marks `name` as being replaced or removed; the returned function clears this mark. */
    protected markReplacing(name: string): () => void {
        this.replacing.set(name, (this.replacing.get(name) ?? 0) + 1);

        return () => {
            const count = (this.replacing.get(name) ?? 1) - 1;

            if (count > 0) {
                this.replacing.set(name, count);
            } else {
                this.replacing.delete(name);
            }
        };
    }

    getRun(id: string): Promise<Run | undefined> {
        return this.runService.findOne(id);
    }

    on<T extends EngineEvent['type']>(event: T, listener: (e: Extract<EngineEvent, { type: T }>) => void): () => void {
        const wrapped = (e: EngineEvent) => {
            if (e.type === event) {
                listener(e as Extract<EngineEvent, { type: T }>);
            }
        };

        this.context.listeners.add(wrapped);

        return () => {
            this.context.listeners.delete(wrapped);
        };
    }

    /** True from drain() until the next start(). */
    get isDraining(): boolean {
        return this.lifecycle.isDraining();
    }

    /** Prepare registered agents and optional candidates without registering or writing to the store. */
    prepare(options: { signal?: AbortSignal; agents?: readonly Agent[] } = {}): Promise<void> {
        return this.lifecycle.prepare(options);
    }

    /**
     * Recovers abandoned runs, starts every channel (in registration order,
     * unless `channels: false`), then starts executing queued runs and
     * polling. A throwing channel start rejects after the channels already
     * started were stopped and polling stopped. A call while another start
     * is in flight joins it; its `signal` then only rejects that call, the
     * joined start goes on (only its own caller's signal or stop() cancel it).
     */
    start(options: EngineStartOptions = {}): Promise<void> {
        return this.lifecycle.start(options);
    }

    /** Abort admission immediately, then join actual provider and channel work before returning. */
    stop(): Promise<void> {
        return this.lifecycle.stop();
    }

    /**
     * Requeues every `running` or `interrupted` run whose claim expired (or was
     * released), so its next execution resumes from the latest checkpoint.
     * Runs executing here and runs with a live claim are left alone. Also runs
     * on every poll. Resolves the number of runs requeued.
     */
    async recover(): Promise<number> {
        return this.lifecycle.recover();
    }

    /**
     * Graceful shutdown: stops starting runs (dispatch still stores them
     * `queued`, for another replica), polling and tick; waits up to `timeoutMs`
     * (default 30 000) for in-flight runs, then aborts the rest and marks them
     * `interrupted` with their claim released.
     */
    async drain(opts: { timeoutMs?: number } = {}): Promise<void> {
        return this.lifecycle.drain(opts);
    }

    /** Resolves when nothing runs, nothing more can be started and no approval delivery is in flight. */
    async idle(): Promise<void> {
        return this.lifecycle.idle();
    }

    /**
     * Cancels a run: aborts it when it executes in this process (resolving once
     * it settled), or marks a queued or waiting run cancelled. A run `running`
     * on another replica (or `interrupted`) gets `cancelRequested`: its owner
     * aborts it on the next poll (within claimTtlMs / 3), and a recovered
     * execution settles it cancelled without a model call. Throws
     * InvalidRunStateError for a settled run, and when the local execution lost
     * its lease meanwhile: the run was not cancelled and may execute on another
     * owner now.
     */
    async cancel(runId: string): Promise<void> {
        return this.cancellation.cancel(runId);
    }

    /**
     * cancel() with a reason the run stores as its `error` (the registry's
     * `agent_replaced`/`agent_removed`); a run on another replica gets it with
     * `cancelRequested`, and the owner's settle keeps it.
     */
    protected async cancelRun(runId: string, reason?: CancelReason): Promise<void> {
        return this.cancellation.cancelRun(runId, reason);
    }

    /** Settles a run nobody executes (`expectStatus`) as cancelled, storing `reason` as its error. */
    protected async cancelStored(runId: string, expectStatus: Run['status'][], reason?: CancelReason): Promise<void> {
        return this.cancellation.cancelStored(runId, expectStatus, reason);
    }

    /**
     * Marks the remote wait of stand-in `runId` `wakeRequested`, so the next
     * tick on any replica polls its remote run at once (a peer's
     * content-free wake): `marked` when this call set the mark, `pending`
     * when it was set already; only for a stand-in waiting on the peer
     * `invoker` authenticates as, `undefined`, with nothing written, otherwise.
     */
    async wake(runId: string, invoker: Invoker | undefined): Promise<WakeOutcome | undefined> {
        return this.remote?.wake(runId, invoker);
    }

    /**
     * Answers the current wait point of a `waiting` run (the caller authorized
     * the approver) and requeues it. Single use: a second answer of the same
     * wait point throws InvalidRunStateError, as does a run that is not
     * waiting, waits on another approval or whose wait point expired
     * (`tick()` denies that one).
     */
    async approve(runId: string, answer: ApprovalAnswer): Promise<void> {
        const decision: ApprovalDecisionInput = {
            approved: answer.approved,
            ...(answer.reason !== undefined ? { reason: answer.reason } : {}),
            ...(answer.approver !== undefined ? { approver: toInvoker(answer.approver, 'approver') } : {}),
        };

        assertSelectionShape(answer.selected);

        const run = await this.runService.findOneOrFail(runId);

        if (run.status === RunStatus.WAITING && run.waiting?.kind === 'dispatch') {
            throw new InvalidRunStateError(`Run "${run.id}" waits on dispatched runs, not on an approval.`);
        }

        if (run.status !== RunStatus.WAITING || run.waiting?.kind !== 'approval') {
            throw new InvalidRunStateError(`Run "${run.id}" is ${run.status} and not waiting for an approval.`);
        }

        if (run.waiting.approvalId !== answer.approvalId) {
            throw new InvalidRunStateError(`Run "${run.id}" does not wait on approval "${answer.approvalId}".`);
        }

        if (this.clock.now() >= run.waiting.expiresAt.getTime()) {
            throw new InvalidRunStateError(`Approval "${answer.approvalId}" of run "${run.id}" expired.`);
        }

        const selected = toSelection(run.waiting, answer.approved, answer.selected);

        await this.answer(
            run,
            run.waiting,
            { ...decision, ...(selected !== undefined ? { selected } : {}) },
            () => new InvalidRunStateError(`Run "${run.id}" moved on to another approval.`),
        );
    }

    /**
     * Denies every approval past its expiresAt ('approval timed out') and
     * re-sends the approval message of every other approval not delivered
     * yet (a failed send, or a crash between the pause and the send).
     * Answers every dispatch wait whose runs all settled (a lost push) and
     * expires the ones past their expiresAt. Starts the polls of remote waits
     * detached (one read per window across replicas, at once after a wake)
     * and times out the ones past their expiresAt. Cancels the unsettled runs
     * of a cancelled parent a lost cascade left. Also runs on every poll.
     */
    async tick(): Promise<void> {
        const now = this.clock.now();
        let resumed = false;
        const { data } = await this.runService.find({ status: [RunStatus.WAITING] });

        for (const listed of data) {
            // a dispatch wait is neither delivered nor denied here
            if (listed.waiting?.kind !== 'approval') {
                continue;
            }

            if (listed.waiting.expiresAt.getTime() > now) {
                if (!listed.waiting.notifiedAt) {
                    await this.deliverApproval(listed, listed.waiting);
                }

                continue;
            }

            try {
                // the listing may be stale by now: the run could wait on a newer approval
                const run = await this.runService.findOne(listed.id);

                if (run?.status !== RunStatus.WAITING || run.waiting?.kind !== 'approval' ||
                    run.waiting.expiresAt.getTime() > now) {
                    continue;
                }

                await this.answer(
                    run,
                    run.waiting,
                    { approved: false, reason: APPROVAL_TIMED_OUT },
                    () => new InvalidRunStateError(`Run "${run.id}" moved on to another approval.`),
                );
                resumed = true;
            } catch (error) {
                // answered meanwhile (approve, another replica)
                if (!(error instanceof InvalidRunStateError)) {
                    this.onError(error, listed);
                }
            }
        }

        // a dispatch wait is never delivered or denied: answered once its runs settled, or expired
        if (await healDispatchWaits(this.dispatchContext(), data, now)) {
            resumed = true;
        }

        // a remote wait is polled detached (never awaited here), or timed out
        if (this.remote && await this.remote.pollWaits(data, now)) {
            resumed = true;
        }

        // a cancel cascade lost to a failure (onRunSettled is best effort); no role, no parent
        const hasRoles = this.listAgents().some((agent) => declaresDispatchRole(agent));

        if (hasRoles) {
            await healCancelCascade(this.dispatchContext()).catch((error: unknown) => this.onError(error));
        }

        // A one-shot job may drain next; finish admission of resumed approvals first.
        if (resumed && this.context.isStarted()) {
            await this.queue.pump();
        }
    }

    /**
     * Answers the approval `waiting` with `decision`: resume() records it under
     * `approval:<runId>:<approvalId>` (where the suspended approve() finds it
     * when its call runs again) and appends the `wait` step.
     */
    protected async answer(
        run: Run,
        waiting: ApprovalWaitPoint,
        decision: ApprovalDecisionInput,
        stale: () => Error,
    ): Promise<void> {
        await this.resume(
            run,
            waiting.approvalId,
            {
                key: approvalDecisionKey(run.id, waiting.approvalId),
                value: {
                    approved: decision.approved,
                    ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
                    ...(decision.approver ? { approver: decision.approver } : {}),
                    ...(decision.selected !== undefined ? { selected: decision.selected } : {}),
                },
            },
            {
                name: waiting.toolName,
                input: {
                    toolCallId: waiting.toolCallId,
                    title: waiting.title,
                    ...(waiting.body !== undefined ? { body: waiting.body } : {}),
                    ...(waiting.artifacts !== undefined ? { artifacts: waiting.artifacts } : {}),
                    ...(waiting.options !== undefined ? { options: waiting.options } : {}),
                    ...(waiting.multiple === true ? { multiple: true } : {}),
                },
                output: {
                    approvalId: waiting.approvalId,
                    approved: decision.approved,
                    reason: decision.reason,
                    ...(decision.approver ? { approver: decision.approver } : {}),
                    ...(decision.selected !== undefined ? { selected: decision.selected } : {}),
                },
            },
            stale,
        );
    }

    /**
     * waiting → queued for the wait point `waitId` (an approval or a dispatch
     * wait), then `record` is stored (where the suspended call finds it when
     * it runs again) and the `wait` step appended. The transition comes first
     * and is guarded by status and wait id, so only one answer ever records;
     * the run stays claimed by us until the record landed, so no pass
     * executes it before.
     *
     * `waiting` survives the transition and is cleared only after the record
     * landed: if we die in between, the run re-pauses on the same wait point, so
     * the wait stays answerable.
     */
    protected async resume(
        run: Run,
        waitId: string,
        record: ResumeRecord,
        step: ResumeStep,
        stale: () => Error,
    ): Promise<void> {
        const now = new Date(this.clock.now());
        const transitioned = await this.runService.update(run.id, {
            status: RunStatus.QUEUED,
            claim: { owner: this.owner, expiresAt: new Date(now.getTime() + this.claimTtlMs) },
            updatedAt: now,
        }, { expectStatus: [RunStatus.WAITING], expectWaitId: waitId });

        let queued: Run;

        try {
            // the run may have moved on to another wait since `waiting` was read
            if (!isSameWaitPoint(transitioned.waiting, waitId)) {
                throw stale();
            }

            await this.effectService.save(record.key, record.value);

            const appended: Step = {
                runId: run.id,
                index: (await this.stepService.find(run.id)).length,
                kind: 'wait',
                name: step.name,
                input: step.input,
                output: step.output,
                startedAt: run.updatedAt,
                finishedAt: now,
            };

            await this.stepService.create(appended);
            this.emit({ type: 'step.appended', step: appended });
            queued = await this.runService.update(run.id, {
                waiting: undefined,
                claim: undefined,
                updatedAt: new Date(this.clock.now()),
            }, { expectStatus: [RunStatus.QUEUED] });
        } catch (error) {
            // undo, so the wait point (still on the run) stays answerable
            await this.runService.update(run.id, {
                status: RunStatus.WAITING,
                claim: undefined,
                updatedAt: new Date(this.clock.now()),
            }, { expectStatus: [RunStatus.QUEUED] }).catch((undoError: unknown) => this.onError(undoError, run));

            throw error;
        }

        this.emit({ type: 'run.updated', run: queued });

        if (this.context.isStarted()) {
            void this.queue.pump();
        }
    }

    /**
     * running → waiting on `request`, releasing claim and slot (a keyed run keeps
     * its key blocked while waiting). Re-pausing on the same wait keeps the
     * wait point, so tokens handed out earlier stay valid. An approval is then
     * delivered; a dispatch wait is answered right away when its runs settled
     * before the write landed (their push found no wait point yet).
     */
    protected async pause(run: Run, request: SuspendRequest, usage: Usage): Promise<void> {
        await this.conversations?.idle(run.id);

        const now = new Date(this.clock.now());
        const waiting = isSameWaitPoint(run.waiting, request.kind === 'approval' ? request.approvalId : request.id) &&
            run.waiting?.kind === request.kind ?
            run.waiting :
            toWaitPoint(request, now);
        const updated = await this.ownedUpdate(run.id, {
            status: RunStatus.WAITING,
            waiting,
            usage,
            claim: undefined,
            updatedAt: now,
        });

        if (!updated) {
            return;
        }

        this.emit({ type: 'run.updated', run: updated });

        // a cancel arrived while pausing (an abort cannot interrupt this write): settle, do not deliver
        const execution = this.executions.get(run.id);

        if (updated.cancelRequested || execution?.stop === 'cancel') {
            await this.cancelStored(run.id, [RunStatus.WAITING], execution?.cancelReason).catch((error: unknown) => {
                if (!(error instanceof InvalidRunStateError)) {
                    this.onError(error, run);
                }
            });

            return;
        }

        if (waiting.kind === 'dispatch') {
            await answerDispatchWait(this.dispatchContext(), run.id).catch((error: unknown) => this.onError(error, updated));

            return;
        }

        if (waiting.kind !== 'approval') {
            return;
        }

        // also on a pause on an approval delivered before: the peer side dedupes its notification
        this.peerReceiver?.onRunEvent(updated);

        if (waiting.notifiedAt) {
            return;
        }

        // detached: the execution ends with the waiting write, so a resume
        // during a slow send starts the next execution cleanly
        const delivery: Promise<void> = this.deliverApproval(updated, waiting)
            .catch((error: unknown) => this.onError(error, updated))
            .finally(() => this.deliveries.delete(delivery));

        this.deliveries.add(delivery);
    }

    /**
     * Sends the approval message of `waiting` through the channel it names
     * (none: inbox and API only, nothing to send) unless it was delivered
     * already: a successful send records `waiting.notifiedAt`. Its key
     * `<runId>:<approvalId>` is fixed once the wait point is stored, so the
     * channel dedupes a send whose record was lost. A store lock `notify:<runId>:<approvalId>` held for one
     * attempt keeps replicas from sending concurrently; the attempt is aborted
     * after claimTtlMs (the lock's TTL). A failed attempt, or a channel the
     * engine does not have, goes to onError and is retried by tick() on the
     * next poll; the run keeps waiting.
     */
    protected async deliverApproval(run: Run, waiting: ApprovalWaitPoint): Promise<void> {
        if (waiting.channel === undefined) {
            return;
        }

        const channel = this.channels.get(waiting.channel);

        if (!channel || typeof channel.out !== 'function') {
            this.onError(new ChannelNotFoundError(waiting.channel), run);

            return;
        }

        const key = `${run.id}:${waiting.approvalId}`;
        const currentWait = (current: Run | undefined): ApprovalWaitPoint | undefined => (
            current?.status === RunStatus.WAITING && current.waiting?.kind === 'approval' &&
            current.waiting.approvalId === waiting.approvalId ?
                current.waiting :
                undefined
        );
        const controller = new AbortController();

        this.deliveryControllers.add(controller);

        try {
            await deliverOnce({
                clock: this.clock,
                lockService: this.lockService,
                claimTtlMs: this.claimTtlMs,
                onError: (error, failed) => this.onError(error, failed),
            }, {
                key,
                run,
                signal: controller.signal,
                timeout: () => new ChamviError({
                    message: `Channel "${channel.name}" did not deliver approval "${waiting.approvalId}" within ${this.claimTtlMs}ms.`,
                    code: ErrorCode.TIMEOUT,
                }),
                // another attempt may have delivered it since `run` was read
                pending: async () => {
                    const current = currentWait(await this.runService.findOne(run.id));

                    return current !== undefined && !current.notifiedAt;
                },
                send: (signal) => channel.out!({
                    kind: 'approval',
                    key,
                    runId: run.id,
                    agent: run.agent,
                    title: waiting.title,
                    body: waiting.notification ?? waiting.body ?? '',
                    ...(waiting.slot !== undefined ? { slot: waiting.slot } : {}),
                    approvalId: waiting.approvalId,
                    expiresAt: waiting.expiresAt,
                    // artifacts stay in the inbox and the API, never in a channel message
                    ...(waiting.options !== undefined ?
                        {
                            options: waiting.options.map((option) => ({
                                id: option.id,
                                label: option.label,
                                ...(option.detail !== undefined ? { detail: option.detail } : {}),
                            })),
                        } :
                        {}),
                    ...(waiting.multiple === true ? { multiple: true } : {}),
                }, waiting.address ?? '', { signal, trigger: run.trigger }),
                record: async (signal) => {
                    // answered meanwhile: nothing left to record
                    if (!currentWait(await this.runService.findOne(run.id))) {
                        return;
                    }

                    signal.throwIfAborted();

                    const notified = await this.runService.update(
                        run.id,
                        { waiting: { ...waiting, notifiedAt: new Date(this.clock.now()) } },
                        { expectStatus: [RunStatus.WAITING] },
                    );

                    this.emit({ type: 'run.updated', run: notified });
                },
                fail: (error, signal) => {
                    if (!this.context.isDraining() || !signal.aborted) {
                        this.onError(error, run);
                    }
                },
            });
        } finally {
            this.deliveryControllers.delete(controller);
        }
    }

    /**
     * The single execution seam: runs one claimed, `running` run to a settled
     * state. `signal` aborts on cancel.
     */
    protected async execute(run: Run, signal: AbortSignal): Promise<void> {
        // cancel() asked for it while it ran elsewhere (or was interrupted): also for an agent unknown here
        if (run.cancelRequested) {
            await this.finish(run.id, { status: RunStatus.CANCELLED });

            return;
        }

        const agent = this.agents.get(run.agent);
        const skills = agent ? this.skills.get(agent) : undefined;

        // a stamped run starts only where the agent has a revision (isStale below compares it)
        const unrevised = run.agentRevision !== undefined && this.revisions.get(run.agent) === undefined;

        if (!agent || !skills || unrevised || !await this.isCurrent(run.agent)) {
            // removed or replaced since the claim: left for a replica that runs the agent's current revision
            // guarded by status and owner (`expectStatus: [RUNNING]`, `expectOwner`): a taken-over run is left alone
            const released = await this.ownedUpdate(run.id, {
                status: RunStatus.QUEUED,
                claim: undefined,
                startedAt: undefined,
            });

            if (released) {
                this.emit({ type: 'run.updated', run: released });
            }

            return;
        }

        // current at the marker's revision, but the run's checked dispatch saw another agent or revision
        const revision = this.revisions.get(run.agent);

        if (this.replacedSince(run) || (revision !== undefined && this.isStale(run, revision))) {
            await this.finish(run.id, {
                status: RunStatus.CANCELLED,
                error: agentCancelReason(run.agent, 'replaced', revision),
            });
            this.checkedRuns.delete(run.id);

            return;
        }

        // started on the agent its check saw
        this.checkedRuns.delete(run.id);

        if (agent.kind === 'remote') {
            // never a model run: a remote agent's runs are stand-ins
            await executeRemoteRun(this.remoteExecuteContext(run, agent, signal));

            return;
        }

        if (agent.kind === 'simple') {
            // a simple agent takes no conversation, so it skips admission
            await executeSimpleRun(this.executeContext(run, agent, skills, signal));

            return;
        }

        let conversation;

        if (run.conversation) {
            const capability = this.conversationOperations.capability();
            const key = conversationKey(agent.definition);

            if (key === undefined) {
                throw new InvalidRunStateError('The agent has disabled conversations.');
            }

            if (key !== run.conversation.scope.identity.agent) {
                throw new InvalidRunStateError('The agent conversation key has changed.');
            }

            const admitted = await capability.admit(structuredClone(run));

            if (admitted.kind === 'busy') {
                this.queue.defer(run.id);

                const released = await this.ownedUpdate(run.id, {
                    status: RunStatus.QUEUED,
                    claim: undefined,
                    startedAt: undefined,
                });

                if (released) {
                    this.emit({ type: 'run.updated', run: released });
                }

                return;
            }

            if (!await this.ownsRun(run.id)) {
                return;
            }

            if (signal.aborted) {
                await this.finish(run.id, { status: RunStatus.CANCELLED });

                return;
            }

            conversation = { capability, snapshot: admitted.snapshot };
        }

        await executeRun(this.executeContext(run, agent, skills, signal, conversation));
    }

    /** What one execution of `run` gets from this engine (an LLM and a simple run alike). */
    protected executeContext(
        run: Run,
        agent: ModelAgent | SimpleAgent,
        skills: SkillContribution,
        signal: AbortSignal,
        conversation?: ExecuteContext['conversation'],
    ): ExecuteContext {
        return {
            engine: this,
            conversation,
            run,
            agent,
            skills,
            model: agent.definition.model ?? this.model,
            models: this.models,
            stepService: this.stepService,
            checkpointService: this.checkpointService,
            effectService: this.effectService,
            artifactService: this.artifactService,
            stateService: this.stateService,
            clock: this.clock,
            signal,
            finish: (patch) => this.finish(run.id, patch),
            update: (patch) => this.executionUpdate(run.id, patch),
            onStepAppended: (step) => this.emit({ type: 'step.appended', step }),
            onDelta: (delta) => this.emit({ type: 'run.delta', delta }),
            pause: (request, usage) => this.pause(run, request, usage),
            ownsRun: () => this.ownsRun(run.id),
            provided: this.provided,
        };
    }

    /** An execution's patch of its still `running` run, emitted; InvalidRunStateError once another owner took it over. */
    protected async executionUpdate(runId: string, patch: Partial<Run>): Promise<Run> {
        const updated = await this.ownedUpdate(runId, patch);

        if (!updated) {
            throw new InvalidRunStateError(`Run "${runId}" was taken over by another owner.`);
        }

        this.emit({ type: 'run.updated', run: updated });

        return updated;
    }

    /**
     * What one execution of a remote agent's stand-in `run` gets from this
     * engine. Its signal aborts with the execution's stop as the reason
     * (`cancel`, `drain`, `lease-lost`), so the start can outlive a cancel.
     */
    protected remoteExecuteContext(run: Run, agent: RemoteAgent, signal: AbortSignal): RemoteExecuteContext {
        if (!this.peers) {
            throw new InvalidRunStateError(`Agent "${agent.name}" is a remote agent, but the engine has no peers.`);
        }

        const stopped = new AbortController();
        const forward = () => stopped.abort(this.executions.get(run.id)?.stop ?? 'cancel');

        if (signal.aborted) {
            forward();
        } else {
            signal.addEventListener('abort', forward, { once: true });
        }

        return {
            run,
            agent,
            peers: this.peers,
            effectService: this.effectService,
            artifactService: this.artifactService,
            clock: this.clock,
            signal: stopped.signal,
            finish: (patch) => this.finish(run.id, patch),
            update: (patch) => this.executionUpdate(run.id, patch),
            pause: (request, usage) => this.pause(run, request, usage),
            onError: (error, failed) => this.onError(error, failed),
        };
    }

    /**
     * The start guard of one scheduling pass, built from one read of the
     * revision markers (skipped while no agent is registered): a run may
     * start when cancel asked for it, or when its agent is registered here
     * and has no revision (an unstamped run) or is loaded at the stored
     * marker's hash. A stamped run of an agent held without a revision is
     * cancelled once no marker of its agent is stored: no replica holds a
     * revision for it any more.
     */
    protected async prepareStart(): Promise<(run: Run) => boolean> {
        // a folder agent's runs start at its marker; an agent without a revision cancels stamped runs without one
        const markers = this.agents.size > 0 ?
            new Map((await this.agentRevisionService.find()).map((marker) => [marker.agent, marker.hash])) :
            new Map<string, string>();

        return (run) => {
            if (!this.context.isStarted() || this.lifecycle.isStartAborted()) {
                return false;
            }

            if (run.cancelRequested) {
                return true;
            }

            const agent = this.agents.get(run.agent);

            if (!agent || !this.skills.get(agent) || !this.agents.has(run.agent) || this.syncing.has(run.agent)) {
                return false;
            }

            const revision = this.revisions.get(run.agent);

            if (this.replacedSince(run)) {
                this.cancelStale(run, revision);

                return false;
            }

            if (revision === undefined) {
                if (run.agentRevision === undefined) {
                    return true;
                }

                // a stamped run is left for a replica that holds the agent at a revision; without a stored
                // marker none does any more (releaseRevision retired it, or a dispatch committed after that)
                if (!markers.has(run.agent)) {
                    this.cancelStale(run, undefined);
                }

                return false;
            }

            if (revision !== markers.get(run.agent)) {
                return false;
            }

            if (this.isStale(run, revision)) {
                this.cancelStale(run, revision);

                return false;
            }

            return true;
        };
    }

    /**
     * Prunes the checked-run fence against a pass's listing of queued runs.
     * Only entries present before the listing started are pruned: their runs
     * were inserted before it, so a run missing from it is no longer queued
     * (running elsewhere, waiting or settled). An entry added meanwhile (a
     * dispatch the listing may not have seen) is kept for the next pass.
     */
    protected pruneCheckedRuns(): (queued: readonly Run[]) => void {
        const before = Array.from(this.checkedRuns.keys());

        return (queued) => {
            const ids = new Set(queued.map((run) => run.id));

            for (const id of before) {
                if (!ids.has(id)) {
                    this.checkedRuns.delete(id);
                }
            }
        };
    }

    /** Whether a checked dispatch of this engine saw another agent object than the one registered now. */
    protected replacedSince(run: Run): boolean {
        const checked = this.checkedRuns.get(run.id);

        return checked !== undefined && checked !== this.agents.get(run.agent);
    }

    /**
     * Whether a run's stamp (a checked dispatch's revision) is neither the
     * revision this engine holds at the marker's hash nor the agent's former
     * revision. An unstamped run is never stale.
     */
    protected isStale(run: Run, revision: string): boolean {
        return run.agentRevision !== undefined &&
            run.agentRevision !== revision &&
            run.agentRevision !== this.formerRevisions.get(run.agent);
    }

    /** Cancels a queued stale run once per engine; a run settled or started meanwhile is left to the cancel's rules. */
    protected cancelStale(run: Run, revision: string | undefined): void {
        if (this.staleCancels.has(run.id)) {
            return;
        }

        const pending = this.cancelRun(run.id, agentCancelReason(run.agent, 'replaced', revision))
            .then(() => {
                this.checkedRuns.delete(run.id);
            })
            .catch((error: unknown) => {
                // settled meanwhile (another replica cancelled it first)
                if (error instanceof InvalidRunStateError) {
                    this.checkedRuns.delete(run.id);

                    return;
                }

                // the fence stays: the next pass tries again
                this.onError(error, run);
            })
            .finally(() => {
                this.staleCancels.delete(run.id);
            });

        this.staleCancels.set(run.id, pending);
    }

    /** Whether the registered agent has no revision or is loaded at the stored marker's hash. */
    protected async isCurrent(name: string): Promise<boolean> {
        if (this.syncing.has(name)) {
            return false;
        }

        const revision = this.revisions.get(name);

        if (revision === undefined) {
            return true;
        }

        return (await this.agentRevisionService.findOne(name))?.hash === revision;
    }

    /** A throwing execution fails the run (and releases its claim) instead of leaking. */
    protected guardedExecute(run: Run): Promise<void> {
        const controller = new AbortController();
        const { promise: done, resolve: release } = Promise.withResolvers<void>();
        const entry = { controller, done };

        this.executions.set(run.id, entry);

        return (async () => {
            try {
                await this.execute(run, controller.signal);
            } catch (error) {
                // the run belongs to another owner now: its failure is not ours to record
                if (this.executions.get(run.id)?.stop === 'lease-lost') {
                    return;
                }

                await this.finish(run.id, { status: RunStatus.FAILED, error: toRunError(error) });
                this.onError(error, run);
            } finally {
                // a later execution of the same run may hold the entry by now
                if (this.executions.get(run.id) === entry) {
                    this.executions.delete(run.id);
                }

                release();
            }
        })();
    }

    /**
     * Settles a `running` run this engine holds the claim of. A run aborted by
     * drain() is marked `interrupted` (claim released, not finished) instead of
     * `cancelled`; after a lost lease nothing is written and undefined resolves.
     */
    protected async finish(id: string, patch: Partial<Run>): Promise<Run | undefined> {
        // Another replica may repair a terminal owner immediately after this write.
        await this.conversations?.idle(id);

        const execution = this.executions.get(id);
        const stop = execution?.stop;

        if (stop === 'lease-lost') {
            return undefined;
        }

        const now = new Date(this.clock.now());
        const settled: Partial<Run> = stop === 'drain' && patch.status === RunStatus.CANCELLED ?
            {
                status: RunStatus.INTERRUPTED,
                usage: patch.usage,
                claim: undefined,
                updatedAt: now,
            } :
            {
                claim: undefined,
                // a run resumed after a crash may still carry its answered wait point
                waiting: undefined,
                finishedAt: now,
                updatedAt: now,
                // a registry cancel's reason; a remote one is already stored and kept
                ...(patch.status === RunStatus.CANCELLED && execution?.cancelReason && { error: execution.cancelReason }),
                // completed despite a cancel request: the stored reason no longer applies
                ...(patch.status === RunStatus.COMPLETED && { error: undefined }),
                ...patch,
            };

        if (settled.usage === undefined) {
            delete settled.usage;
        }

        const updated = await this.ownedUpdate(id, settled);

        if (updated) {
            this.emit({ type: 'run.updated', run: updated });
            await this.conversationOperations.reconcile(updated);
            this.remote?.cancelSettled(updated);
            this.peerReceiver?.onRunEvent(updated);
            await onRunSettled(this.dispatchContext(), updated);
        }

        return updated;
    }

    /**
     * Updates a `running` run only while this engine holds its claim. Resolves
     * undefined (and aborts the execution) when another owner took it over.
     */
    protected async ownedUpdate(id: string, patch: Partial<Run>): Promise<Run | undefined> {
        try {
            return await this.runService.update(id, patch, { expectStatus: [RunStatus.RUNNING], expectOwner: this.owner });
        } catch (error) {
            if (error instanceof InvalidRunStateError && !await this.ownsRun(id)) {
                return undefined;
            }

            throw error;
        }
    }

    /** Whether this engine still holds the run's claim; aborts its execution when not. */
    protected async ownsRun(id: string): Promise<boolean> {
        const run = await this.runService.findOne(id);

        if (run?.claim?.owner === this.owner) {
            return true;
        }

        this.loseLease(id);

        return false;
    }

    /**
     * Aborts the local execution of a run another owner may hold now; it writes
     * nothing more. Reported once per execution as a LeaseLostError.
     */
    protected loseLease(id: string): void {
        const execution = this.executions.get(id);

        if (!execution || execution.stop === 'lease-lost') {
            return;
        }

        execution.stop = 'lease-lost';
        execution.controller.abort();
        this.onError(new LeaseLostError(id));
    }

    /**
     * What putAgent() refuses before any store read or write: a model that
     * does not resolve, a subscription to a channel the engine does not have
     * (InvalidAgentDefinitionError). Registers nothing: its skill check
     * neither selects a skill runtime nor captures the agent's inputs.
     */
    checkAgent(agent: Agent): void {
        this.assertRegistrable(agent, { commit: false });
    }

    /**
     * Refuses an agent the engine cannot run: one whose kind is unknown or
     * disagrees with its definition, or one subscribing to a channel it does not have.
     * `commit: false` (checkAgent()) keeps the skill check free of state changes.
     */
    protected assertRegistrable(agent: Agent, options: { commit?: boolean } = {}): void {
        // first: putAgent refuses before syncing, the lock and any store write
        assertAgentKind(agent);

        if (agent.kind === 'model') {
            checkAgentModel(agent, { model: this.model, models: this.models });
        }

        if (agent.kind === 'remote') {
            this.assertRemoteAgent(agent);
        }

        assertConcurrencyMaxRuns(agent.definition.concurrencyMaxRuns, `Agent "${agent.name}" concurrencyMaxRuns`);

        for (const subscription of agent.definition.channels ?? []) {
            assertConcurrencyMaxRuns(subscription.concurrencyMaxRuns, `Agent "${agent.name}" subscription "${subscription.id}" concurrencyMaxRuns`);

            if (!this.channels.has(subscription.channel)) {
                throw new InvalidAgentDefinitionError(`Agent "${agent.name}" subscribes to unknown channel "${subscription.channel}".`);
            }
        }

        assertDispatchRoles(agent);

        if (conversationKey(agent.definition) !== undefined && !this.conversations) {
            throw new InvalidAgentDefinitionError('The agent enables conversations but the engine has no conversation capability.');
        }

        this.skills.checkAgent(agent, options);
    }

    /**
     * A remote agent passes defineRemoteAgent()'s checks again (a hand-built
     * one skipped them) with `agent`, `role` and `timeoutMs` set, its peer is
     * configured and its `approvals` channel registered with `out`.
     */
    protected assertRemoteAgent(agent: RemoteAgent): void {
        const { definition } = agent;

        assertRemoteAgent(definition);

        if (definition.agent === undefined || definition.role === undefined || definition.timeoutMs === undefined) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" needs agent, role and timeoutMs: build it with defineRemoteAgent().`);
        }

        const { peer, approvals } = definition;

        if (!this.peers) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" names unknown peer "${peer}": the engine has no peers (EngineOptions.peers).`);
        }

        if (!this.peers.has(peer)) {
            throw new InvalidAgentDefinitionError(`Agent "${agent.name}" names unknown peer "${peer}".`);
        }

        if (approvals && typeof this.channels.get(approvals.channel)?.out !== 'function') {
            throw new InvalidAgentDefinitionError(
                `Agent "${agent.name}": approvals channel "${approvals.channel}" is not registered or sends nothing (no out).`,
            );
        }
    }

    protected registry(): RegistryContext {
        return {
            agentRevisionService: this.agentRevisionService,
            lockService: this.lockService,
            runService: this.runService,
            clock: this.clock,
            claimTtlMs: this.claimTtlMs,
            cancel: (runId, reason) => this.cancelRun(runId, reason),
            onError: (error, run) => this.onError(error, run),
        };
    }

    protected dispatchContext(): DispatchEngineContext {
        return this.intake.dispatchContext();
    }


    protected emit(event: EngineEvent): void {
        this.context.emit(event);
    }
}
