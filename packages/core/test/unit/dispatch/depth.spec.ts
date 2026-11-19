/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import {
    Engine,
    agent,
    agentChannel,
    defineSimpleAgent,
    dispatchTo,
} from '@chamvi/core';
import type { DispatchResult } from '@chamvi/core';
import { ControllableClock } from '../../utils/clock.ts';
import { createTestServices, servicesOf } from '../../utils/engine.ts';
import { fakePeers } from '../../utils/peers.ts';

const START = new Date(Date.UTC(2026, 10, 3, 6));

function setup(maxDepth: number) {
    const clock = new ControllableClock(START);
    const store = createTestServices({ clock });
    const peers = fakePeers({ dev: {} });
    const errors: unknown[] = [];

    peers.recognize = (invoker) => (invoker?.id === 'dev-token' ? 'dev' : undefined);

    const lead = defineSimpleAgent({
        name: 'lead',
        channels: [agent.on({ from: ['dev/maintainer'], maxDepth: 2 })],
        run: async (payload, ctx): Promise<DispatchResult | { error: string }> => {
            try {
                return await dispatchTo(ctx, { agent: 'worker', payload });
            } catch (error) {
                return { error: (error as Error).message };
            }
        },
    });
    const worker = defineSimpleAgent({
        name: 'worker',
        channels: [agent.on({ from: ['lead'], maxDepth })],
        run: async () => 'done',
    });
    const engine = new Engine({
        ...servicesOf(store),
        clock,
        agents: [lead, worker],
        channels: [agentChannel()],
        peers: peers.resolver,
        onError: (error) => {
            errors.push(error);
        },
    });

    return {
        engine, 
        store, 
        errors, 
    };
}

async function startLead(engine: Engine): Promise<string> {
    await engine.start();

    const { runId } = await engine.dispatchPeer({
        agent: 'lead',
        trigger: 'peer',
        channel: 'peer',
        payload: {},
        idempotencyKey: 'stand-in-1',
        invoker: {
            id: 'dev-token',
            kind: 'token',
            bindings: [{ permission: { name: Permission.AGENT_RUN } } as never],
        },
    }, {
        role: 'default',
        standIn: 'stand-in-1',
        parent: {
            runId: 'caller-1', 
            agent: 'maintainer', 
            depth: 0, 
        },
        taint: false,
    });

    await engine.idle();

    return runId;
}

describe('dispatch depth across peers', () => {
    it('counts a peer parent\'s depth: a child of a peer-started run at depth 1 gets depth 2', async () => {
        const { engine, store } = setup(2);
        const leadId = await startLead(engine);
        const [child] = (await store.runService.find({ parentRunId: leadId })).data;

        expect((await store.runService.findOne(leadId))?.trigger.parent?.depth).toBe(1);
        expect(child?.trigger.parent).toMatchObject({
            kind: 'dispatch', 
            runId: leadId, 
            depth: 2, 
        });

        await engine.stop();
    });

    it('refuses the child when depth 2 exceeds the role\'s maxDepth', async () => {
        const { engine, store } = setup(1);
        const leadId = await startLead(engine);

        expect((await store.runService.find({ parentRunId: leadId })).data).toHaveLength(0);
        expect((await store.runService.findOne(leadId))?.output).toEqual({ error: 'Agent "worker" role "default" accepts dispatches up to depth 1.' });

        await engine.stop();
    });
});
