/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { hostname } from 'node:os';
import { pid } from 'node:process';
import type { Agent } from '../agent/types.ts';
import type { ChannelContext, DispatchResult, IChannel } from '../channel/types.ts';
import type { ConversationInspection, IConversationService, IConversations } from '../conversation/types.ts';
import type {
    ConversationBinding,
    ConversationIdentity,
    ConversationScope,
    Invoker,
    Run,
    TriggerParent,
} from '@chamvi/store';
import { CLOCK_KEY } from '../clock/context.ts';
import { systemClock } from '../clock/index.ts';
import type { IClock } from '../clock/index.ts';
import type { ContextKey } from '../context/types.ts';
import { DISPATCH_CONTEXT } from '../dispatch/constants.ts';
import type { DispatchHost } from '../dispatch/types.ts';
import { MODEL_CONTEXT } from '../model/constants.ts';
import { checkDefaultModel } from '../model/module.ts';
import type { IModelResolver, ModelContext, ModelRef } from '../model/types.ts';
import type { IPeerResolver, PeerStartInput } from '../peer/types.ts';
import { EngineSkills } from './skills/module.ts';
import type { IEngineSkills } from './skills/types.ts';
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
import { EngineApprovals } from './approvals/module.ts';
import type { IEngineApprovals } from './approvals/types.ts';
import { EngineCancel } from './cancel/module.ts';
import type { IEngineCancel } from './cancel/types.ts';
import {
    createEngineConversations,
    provideEngineContextValue,
    subscribeEngineEvent,
    toEngineChannelMap,
} from './context/helpers.ts';
import { createEngineContext } from './context/module.ts';
import type { EngineContext } from './context/types.ts';
import { EngineConversations } from './conversations/module.ts';
import type { IEngineConversations } from './conversations/types.ts';
import type { DispatchEngineContext } from './dispatch/types.ts';
import { EngineStartGuard } from './guard/module.ts';
import type { IEngineStartGuard } from './guard/types.ts';
import { EngineIntake } from './intake/module.ts';
import type { IEngineIntake } from './intake/types.ts';
import { EngineLifecycle } from './lifecycle/module.ts';
import type { IEngineLifecycle } from './lifecycle/types.ts';
import { EngineRemote } from './remote/caller/module.ts';
import type { IEngineRemote } from './remote/caller/types.ts';
import { EnginePeerReceiver } from './remote/receiver/module.ts';
import type { IEnginePeerReceiver } from './remote/receiver/types.ts';
import type { RemoteEngineContext } from './remote/types.ts';
import { RunQueue } from './queue/module.ts';
import { EngineRegistry } from './registry/engine.ts';
import type { CancelReason, IEngineRegistry, PutAgentOptions } from './registry/types.ts';
import { EngineRunner } from './runner/module.ts';
import type { IEngineRunner } from './runner/types.ts';
import type {
    ApprovalAnswer,
    DispatchEnvelope,
    EngineEvent,
    EngineOptions,
    EngineStartOptions,
    IEngine,
    WakeOutcome,
} from './types.ts';

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

    /** The registered agents by name (the registry's map). */
    protected readonly agents: Map<string, Agent>;

    /** The revision each registered agent was loaded at (the registry's map); undefined for an agent without a revision. */
    protected readonly revisions: Map<string, string | undefined>;

    /**
     * The agent object each checked dispatch of this engine saw, by run id
     * (memory only, never stored): a queued run whose agent was replaced
     * since is cancelled at admission, whatever the clock read. Removed when
     * the run starts or is cancelled here; a failed cancel keeps it.
     */
    protected readonly checkedRuns = new Map<string, Agent>();

    /** The registered channels by name, in registration order. */
    protected readonly channels: Map<string, IChannel<any, any>>;

    /** Every time-based decision of the engine; packages built on it share it. */
    readonly clock: IClock;

    protected readonly queue: RunQueue;

    protected readonly conversations?: IConversations;

    /** The default model of agents without one (EngineOptions.model). */
    protected readonly model?: ModelRef;

    /** Resolves string model refs (EngineOptions.models). */
    protected readonly models?: IModelResolver;

    protected readonly onError: (error: unknown, run?: Run) => void;

    /** The caller side of remote agents (polls, wakes, timeouts, remote approvals and cancels); only with peers. */
    protected readonly remote?: IEngineRemote;

    /** The receiver side: signals to the peer that started a run here; only with peers. */
    protected readonly peerReceiver?: IEnginePeerReceiver;

    /** What the parts of this engine share. */
    protected readonly context: EngineContext;

    /** The live agent registry and its checks. */
    protected readonly registry: IEngineRegistry;

    /** dispatch(), a peer's start and the dispatch hosts. */
    protected readonly intake: IEngineIntake;

    /** cancel() and the cancels of the registry and the start guard. */
    protected readonly cancellation: IEngineCancel;

    /** The conversation operations and channel contexts. */
    protected readonly conversationOperations: IEngineConversations;

    /** Which queued runs may start here. */
    protected readonly guard: IEngineStartGuard;

    /** Approvals, expiry, pauses and resumes. */
    protected readonly approvals: IEngineApprovals;

    /** Executes claimed runs and settles them. */
    protected readonly runner: IEngineRunner;

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
        this.conversations = createEngineConversations(opts);
        this.channels = toEngineChannelMap(opts.channels ?? []);
        this.clock = opts.clock ?? systemClock;
        this.peers = opts.peers;
        this.model = opts.model;
        this.models = opts.models;
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
            owner: opts.owner ?? `${hostname()}-${pid}`,
            claimTtlMs: opts.claimTtlMs ?? 60_000,
            // forwards the arguments as given: a caller's onError(error) stays a one-argument call
            onError: (...args) => this.onError(...args),
            isStarted: () => this.lifecycle.isStarted(),
            isDraining: () => this.lifecycle.isDraining(),
            getAgent: (name) => this.agents.get(name),
            getChannel: (name) => this.channels.get(name),
        });
        this.registry = new EngineRegistry({
            ...this.context,
            model: this.model,
            models: this.models,
            skills: this.skills,
            hasConversations: this.conversations !== undefined,
            engine: this,
            preparationSignal: () => this.lifecycle.preparationSignal(),
            cancelRun: (runId, reason) => this.cancelRun(runId, reason),
        }, opts.agents);
        this.agents = this.registry.state.agents;
        this.revisions = this.registry.state.revisions;
        checkDefaultModel({ model: this.model, models: this.models });

        // set directly: the key is module-private, so no provide() can collide
        this.context.provided.set(MODEL_CONTEXT, {
            model: this.model,
            models: this.models,
            agentModel: (name: string) => this.agents.get(name)?.definition.model,
        } satisfies ModelContext);
        this.context.provided.set(CLOCK_KEY, this.clock);
        this.intake = new EngineIntake({
            ...this.context,
            agentRevision: (name) => this.revisions.get(name),
            isReplacing: (name) => this.registry.state.replacing.has(name),
            checkedRuns: this.checkedRuns,
            cancelReplaced: (runId, name) => this.cancellation.cancelReplaced(runId, name),
            pump: () => this.queue.pump(),
            resume: (run, waitId, record, step, stale) => this.approvals.resume(run, waitId, record, step, stale),
            cancel: (runId, reason) => this.cancelRun(runId, reason),
            createRun: (envelope, parent, conversation, taintSource) => this.createRun(envelope, parent, conversation, taintSource),
        });
        this.context.provided.set(DISPATCH_CONTEXT, this.createDispatchHost());

        if (opts.peers) {
            const remoteContext: RemoteEngineContext = {
                // the context's lockService, effectService, getAgent, getChannel and detach, under the dispatch context
                ...this.context,
                ...this.dispatchContext(),
                peers: opts.peers,
                peerEvent: (run) => this.peerReceiver?.onRunEvent(run),
            };

            this.remote = new EngineRemote(remoteContext);
            this.peerReceiver = new EnginePeerReceiver(remoteContext);
        }

        for (const agent of opts.agents) {
            this.registry.assertRegistrable(agent);
        }

        // eslint-disable-next-line no-console
        this.onError = opts.onError ?? ((error) => console.error('[chamvi]', error));

        this.queue = new RunQueue({
            // the context's lockService, runService, getAgent, clock, owner and claimTtlMs
            ...this.context,
            concurrencyMaxRuns: opts.concurrencyMaxRuns ?? 4,
            execute: (run) => this.runner.guardedExecute(run),
            onError: (error, run) => this.onError(error, run),
            onRunUpdated: (run) => this.context.emit({ type: 'run.updated', run }),
            onPoll: async () => {
                await this.tick();
                await this.recover();
            },
            onLeaseLost: (runId) => this.runner.loseLease(runId),
            prepareStart: () => this.guard.prepareStart(),
            beforeList: () => this.guard.pruneCheckedRuns(),
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
            createRun: (envelope, parent, conversation) => this.createRun(envelope, parent, conversation),
            retryDeferred: () => this.queue.retryDeferred(),
            pump: () => this.queue.pump(),
        });
        this.guard = new EngineStartGuard({
            ...this.context,
            registry: this.registry.state,
            skills: this.skills,
            checkedRuns: this.checkedRuns,
            isStartAborted: () => this.lifecycle.isStartAborted(),
            cancelRun: (runId, reason) => this.cancelRun(runId, reason),
        });
        this.runner = new EngineRunner({
            ...this.context,
            engine: this,
            execute: (run, signal) => this.execute(run, signal),
            finish: (id, patch) => this.finish(id, patch),
            registry: this.registry.state,
            skills: this.skills,
            model: this.model,
            models: this.models,
            conversations: this.conversations,
            conversationOperations: this.conversationOperations,
            queue: this.queue,
            guard: this.guard,
            checkedRuns: this.checkedRuns,
            remote: this.remote,
            peerReceiver: this.peerReceiver,
            pause: (run, request, usage) => this.approvals.pause(run, request, usage),
            dispatchContext: () => this.dispatchContext(),
        });
        this.approvals = new EngineApprovals({
            ...this.context,
            conversations: this.conversations,
            remote: this.remote,
            peerReceiver: this.peerReceiver,
            engine: this,
            pump: () => this.queue.pump(),
            cancelStored: (runId, expectStatus, reason) => this.cancellation.cancelStored(runId, expectStatus, reason),
            ownedUpdate: (id, patch) => this.runner.ownedUpdate(id, patch),
            dispatchContext: () => this.dispatchContext(),
        });
        this.lifecycle = new EngineLifecycle({
            ...this.context,
            queue: this.queue,
            skills: this.skills,
            conversations: this.conversations,
            staleCancels: this.guard.staleCancels,
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
        provideEngineContextValue(this.context.provided, key, value);
    }

    /** Synchronous live registry lookup; no loading, creation or I/O. Missing agents return undefined. */
    getAgent(name: string): Agent | undefined {
        return this.registry.getAgent(name);
    }

    /** The registered agents in registration order, as a new array. */
    listAgents(): Agent[] {
        return this.registry.listAgents();
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
        return this.registry.agentRevision(name);
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
    async putAgent(agent: Agent, options: PutAgentOptions = {}): Promise<'added' | 'replaced' | 'unchanged'> {
        return this.registry.putAgent(agent, options);
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
        return this.registry.releaseRevision(name);
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
        return this.registry.removeAgent(name);
    }

    getRun(id: string): Promise<Run | undefined> {
        return this.runService.findOne(id);
    }

    on<T extends EngineEvent['type']>(event: T, listener: (e: Extract<EngineEvent, { type: T }>) => void): () => void {
        return subscribeEngineEvent(this.context.listeners, event, listener);
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

    /**
     * Marks the remote wait of stand-in `runId` `wakeRequested`, so the next
     * tick on any replica polls its remote run at once (a peer's
     * content-free wake): `marked` when this call set the mark, `pending`
     * when it was set already; only for a stand-in waiting on the peer
     * `invoker` authenticates as, `undefined`, with nothing written, otherwise.
     */
    async wake(runId: string, invoker: Invoker | undefined): Promise<WakeOutcome | undefined> {
        return this.approvals.wake(runId, invoker);
    }

    /**
     * Answers the current wait point of a `waiting` run (the caller authorized
     * the approver) and requeues it. Single use: a second answer of the same
     * wait point throws InvalidRunStateError, as does a run that is not
     * waiting, waits on another approval or whose wait point expired
     * (`tick()` denies that one).
     */
    async approve(runId: string, answer: ApprovalAnswer): Promise<void> {
        return this.approvals.approve(runId, answer);
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
        return this.approvals.tick();
    }

    /**
     * The single execution seam: runs one claimed, `running` run to a settled
     * state. `signal` aborts on cancel.
     */
    protected async execute(run: Run, signal: AbortSignal): Promise<void> {
        return this.runner.execute(run, signal);
    }

    /**
     * Settles a `running` run this engine holds the claim of. A run aborted by
     * drain() is marked `interrupted` (claim released, not finished) instead of
     * `cancelled`; after a lost lease nothing is written and undefined resolves.
     */
    protected async finish(id: string, patch: Partial<Run>): Promise<Run | undefined> {
        return this.runner.settleRun(id, patch);
    }

    /**
     * What putAgent() refuses before any store read or write: a model that
     * does not resolve, a subscription to a channel the engine does not have
     * (InvalidAgentDefinitionError). Registers nothing: its skill check
     * neither selects a skill runtime nor captures the agent's inputs.
     */
    checkAgent(agent: Agent): void {
        this.registry.checkAgent(agent);
    }

    protected dispatchContext(): DispatchEngineContext {
        return this.intake.dispatchContext();
    }
}
