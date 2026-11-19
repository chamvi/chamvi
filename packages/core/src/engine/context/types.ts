/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamvi/store';
import type { Agent } from '../../agent/types.ts';
import type { IAgentRevisionService } from '../../agent-revision/types.ts';
import type { IArtifactService } from '../../artifact/types.ts';
import type { IChannel } from '../../channel/types.ts';
import type { ICheckpointService } from '../../checkpoint/types.ts';
import type { IClock } from '../../clock/index.ts';
import type { IConnectionService } from '../../connection/types.ts';
import type { ContextKey } from '../../context/types.ts';
import type { IConversationService } from '../../conversation/types.ts';
import type { IEffectService } from '../../effect/types.ts';
import type { IIdempotencyService } from '../../idempotency/types.ts';
import type { ILockService } from '../../lock/types.ts';
import type { IPeerResolver } from '../../peer/types.ts';
import type { IRunService } from '../../run/types.ts';
import type { IStateService } from '../../state/types.ts';
import type { IStepService } from '../../step/types.ts';
import type { CancelReason } from '../registry/types.ts';
import type { EngineEvent } from '../types.ts';

/**
 * A run executing in this process (internal). `stop` says why the execution
 * was aborted: cancel settles it `cancelled`, drain `interrupted`, and after
 * a lost lease it writes nothing at all.
 */
export type EngineExecution = {
    controller: AbortController;
    done: Promise<void>;
    stop?: 'cancel' | 'drain' | 'lease-lost';
    /** What a cancel by the registry stores on the run when it settles `cancelled`. */
    cancelReason?: CancelReason;
};

/** What the engine gives createEngineContext(): its services, settings and live lookups (internal). */
export type EngineContextInput = {
    runService: IRunService;
    stepService: IStepService;
    checkpointService: ICheckpointService;
    effectService: IEffectService;
    artifactService: IArtifactService;
    stateService: IStateService;
    agentRevisionService: IAgentRevisionService;
    lockService: ILockService;
    idempotencyService: IIdempotencyService;
    connectionService: IConnectionService | undefined;
    conversationService: IConversationService | undefined;
    peers: IPeerResolver | undefined;
    clock: IClock;
    owner: string;
    claimTtlMs: number;
    onError(error: unknown, run?: Run): void;
    /** True from a start() until stop() or drain() (read live, never copied). */
    isStarted(): boolean;
    /** True from drain() until the next start() (read live, never copied). */
    isDraining(): boolean;
    /** Synchronous live registry lookup; no loading, creation or I/O. */
    getAgent(name: string): Agent | undefined;
    /** The registered channel of that name. */
    getChannel(name: string): IChannel | undefined;
};

/**
 * What the parts of the engine share (internal): the services and settings,
 * the mutable state every part reads by reference, and the engine-wide
 * operations on it.
 */
export type EngineContext = EngineContextInput & {
    /** Runs executing in this process, by id. */
    executions: Map<string, EngineExecution>;
    /**
     * Approval deliveries started by a pause, detached from the execution so
     * a slow channel holds neither the slot nor the executions entry (a resume
     * meanwhile starts the next execution), and the peer requests of remote
     * waits (polls, remote cancels); idle() and drain() wait for them.
     */
    deliveries: Set<Promise<void>>;
    deliveryControllers: Set<AbortController>;
    /** Values tools reach through inject(ctx, key), by reference. */
    provided: Map<ContextKey<unknown>, unknown>;
    /** The listeners of on(). */
    listeners: Set<(e: EngineEvent) => void>;
    /** Calls every listener; a throwing one goes to onError. */
    emit(event: EngineEvent): void;
    /**
     * Runs `work` detached, tracked in `deliveries` (idle() and drain() wait
     * for it); drain() aborts its signal. A rejection goes to onError, except
     * an abort by drain.
     */
    detach(work: (signal: AbortSignal) => Promise<void>, run?: Run): void;
    /** Strictly increasing per process, so FIFO order survives identical clock readings. */
    nextCreatedAt(): Date;
};
