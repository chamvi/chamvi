/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run, Usage } from '@chamvi/store';
import type { Agent } from '../../agent/types.ts';
import type { IChannel } from '../../channel/types.ts';
import type { IEffectService } from '../../effect/types.ts';
import type { ILockService } from '../../lock/types.ts';
import type { IPeerResolver } from '../../peer/types.ts';
import type { DispatchEngineContext } from '../dispatch/types.ts';

/**
 * How the remote run of a stand-in ended (internal), recorded under
 * `remote-wait:<runId>`: the next execution settles the stand-in from it.
 * `timeout` is the stand-in's own deadline, not a remote status.
 */
export type RemoteOutcome = {
    status: 'completed' | 'failed' | 'cancelled' | 'timeout';
    output?: unknown;
    error?: { code: string; message: string };
    /** The remote run was tainted. */
    tainted: boolean;
    /** The remote run's usage, added to the stand-in's. */
    usage: Usage;
};

/** What `remote-start:<runId>` records (internal): the remote run the start created. */
export type RemoteStartRecord = {
    runId: string;
    /** The peer the remote run lives at (a cancel still reaches it after the agent is gone). */
    peer?: string;
};

/** What answerRemoteWait() needs from the engine. */
export type RemoteAnswerContext = Pick<DispatchEngineContext, 'runService' | 'resume'>;

/** What EngineRemote (the poll, wake, timeout, approvals and remote cancel of stand-ins) needs from the engine. */
export type RemoteEngineContext = RemoteAnswerContext & Pick<DispatchEngineContext, 'clock' | 'claimTtlMs' | 'onError' | 'emit'> & {
    lockService: ILockService;
    effectService: IEffectService;
    peers: IPeerResolver;
    /** The registered agent `name` (a remote agent's `approvals` destination). */
    getAgent(name: string): Agent | undefined;
    /** The registered channel `name` (the `approvals` destination's channel). */
    getChannel(name: string): IChannel | undefined;
    /**
     * Runs `work` detached from the caller: tracked like an approval delivery
     * (idle() and drain() wait for it), its signal aborted by drain(), a
     * rejection reported to onError.
     */
    detach(work: (signal: AbortSignal) => Promise<void>, run?: Run): void;
    /** A run settled or an approval became pending in it: the receiver's ping and notification (EnginePeerReceiver). */
    peerEvent(run: Run): void;
};

/** What EnginePeerReceiver (the receiver's ping and approval notification) needs from the engine. */
export type PeerReceiverContext = Pick<
    RemoteEngineContext,
    'runService' | 'clock' | 'claimTtlMs' | 'onError' | 'lockService' | 'effectService' | 'peers' | 'getChannel' | 'detach'
>;
