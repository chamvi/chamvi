/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    Engine,
    agent,
    agentChannel,
    defineRemoteAgent,
    defineSimpleAgent,
    dispatchTo,
} from '@chamvi/core';
import type {
    EngineOptions,
    IChannel,
    PeerSettings,
    RemoteAgentDefinition,
} from '@chamvi/core';
import type { Run } from '@chamvi/core-kit';
import { answerRemoteWait } from '../../src/engine/remote/caller/answer.ts';
import type { RemoteOutcome } from '../../src/engine/remote/types.ts';
import { ControllableClock } from './clock.ts';
import { createTestServices, servicesOf } from './engine.ts';
import type { TestServiceSet } from './engine.ts';
import { fakePeers } from './peers.ts';
import type { FakePeers } from './peers.ts';

export const REMOTE_START = new Date(Date.UTC(2026, 10, 3, 6));

/** An engine that answers a stand-in's remote wait directly (the poll's job in production). */
export class RemoteTestEngine extends Engine {
    answerRemote(runId: string, outcome: RemoteOutcome): Promise<boolean> {
        return answerRemoteWait(this.dispatchContext(), runId, outcome);
    }
}

export type RemoteSetup = {
    engine: RemoteTestEngine;
    store: TestServiceSet;
    clock: ControllableClock;
    peers: FakePeers;
    errors: unknown[];
    /** A replica of `engine` on the same store, clock and peers. */
    replica(): RemoteTestEngine;
};

/** An untrusted input channel: a run it starts is tainted from the start. */
const web = {
    name: 'web',
    untrusted: true,
    in: () => () => {},
} as unknown as IChannel;

/**
 * `developer` is a remote agent at peer `dev` that `alfred` (a simple agent)
 * may dispatch to; alfred's run dispatches developer with its own payload
 * and returns the dispatch result.
 */
export function setupRemote(options: {
    developer?: Partial<RemoteAgentDefinition>;
    peers?: Record<string, Partial<PeerSettings>>;
    engine?: Partial<EngineOptions>;
} = {}): RemoteSetup {
    const clock = new ControllableClock(REMOTE_START);
    const store = createTestServices({ clock });
    const peers = fakePeers(options.peers ?? { dev: {} });
    const errors: unknown[] = [];
    const developer = defineRemoteAgent({
        name: 'developer',
        peer: 'dev',
        channels: [agent.on({ from: ['alfred'] })],
        ...options.developer,
    });
    const alfred = defineSimpleAgent({
        name: 'alfred',
        run: async (payload, ctx) => dispatchTo(ctx, { agent: 'developer', payload }),
    });
    const build = () => new RemoteTestEngine({
        ...servicesOf(store),
        clock,
        agents: [developer, alfred],
        channels: [agentChannel(), web],
        peers: peers.resolver,
        onError: (error) => {
            errors.push(error);
        },
        ...options.engine,
    });
    const engine = build();

    return {
        engine,
        store,
        clock,
        peers,
        errors,
        replica: build,
    };
}

/** Dispatches `developer` directly (channel `test`) after starting the engine; resolves its run id. */
export async function startStandIn(engine: Engine, extra: Partial<Parameters<Engine['dispatch']>[0]> = {}): Promise<string> {
    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'developer',
        trigger: 'test',
        channel: 'test',
        payload: { task: 'upgrade' },
        ...extra,
    });

    await engine.idle();

    return runId;
}

/** The run, read from the store (fails the test when absent). */
export async function readRun(store: TestServiceSet, runId: string): Promise<Run> {
    const run = await store.runService.findOne(runId);

    if (!run) {
        throw new Error(`Run ${runId} not found.`);
    }

    return run;
}
