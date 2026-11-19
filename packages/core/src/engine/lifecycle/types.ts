/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent } from '../../agent/types.ts';
import type { IChannel } from '../../channel/types.ts';
import type { IConversations } from '../../conversation/types.ts';
import type { EngineContext } from '../context/types.ts';
import type { RunQueue } from '../queue/module.ts';
import type { IEngineSkills } from '../skills/types.ts';
import type { EngineStartOptions, IEngine } from '../types.ts';

/** Preparation, start, stop, recovery and drain of an engine (internal). */
export interface IEngineLifecycle {
    /** True from a start() until stop() or drain(). */
    isStarted(): boolean;
    /** True from drain() until the next start(). */
    isDraining(): boolean;
    /** Whether a start() in flight was aborted. */
    isStartAborted(): boolean;
    /** The signal of the current preparation controller (aborted by stop()). */
    preparationSignal(): AbortSignal;
    prepare(options?: { signal?: AbortSignal; agents?: readonly Agent[] }): Promise<void>;
    start(options?: EngineStartOptions): Promise<void>;
    stop(): Promise<void>;
    startChannels(signal: AbortSignal): Promise<void>;
    stopChannels(): Promise<void>;
    recover(): Promise<number>;
    drain(opts?: { timeoutMs?: number }): Promise<void>;
    idle(): Promise<void>;
}

/** What EngineLifecycle needs from the engine (internal). */
export type EngineLifecycleContext = Pick<
    EngineContext,
    'runService' | 'clock' | 'owner' | 'claimTtlMs' | 'onError' | 'emit' | 'executions' | 'deliveries' | 'deliveryControllers'
> & {
    queue: RunQueue;
    skills: IEngineSkills;
    /** The conversation capability, when the engine has one. */
    conversations?: IConversations;
    /** Cancels of stale queued runs, by run id; idle() waits for them. */
    staleCancels: ReadonlyMap<string, Promise<void>>;
    /**
     * The engine: the lifecycle calls its public operations (prepare, start,
     * stop, recover, idle, channelContext) through it, so a
     * subclass or a spy on the engine sees every call.
     */
    engine: Pick<IEngine, 'prepare' | 'start' | 'stop' | 'recover' | 'idle' | 'channelContext'>;
    /** The registered agents in registration order. */
    listAgents(): Agent[];
    /** The registered channels in registration order. */
    listChannels(): IChannel[];
};
