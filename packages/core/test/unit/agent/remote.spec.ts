/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { LanguageModel } from 'ai';
import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import { z } from 'zod';
import {
    APPROVAL_TIMEOUT_MAX_MS,
    InvalidAgentDefinitionError,
    REMOTE_TIMEOUT_DEFAULT_MS,
    agent,
    agentChannel,
    consoleChannel,
    defineRemoteAgent,
} from '@chamvi/core';
import type {
    Agent,
    IChannel,
    RemoteAgent,
    RemoteAgentDefinition,
} from '@chamvi/core';
import { createTestEngine, createTestServices } from '../../utils/engine.ts';
import { fakePeers } from '../../utils/peers.ts';

function inOnly(name: string): IChannel {
    return { name, in: () => () => {} } as unknown as IChannel;
}

describe('remote agents', () => {
    it('defines a remote agent with its defaults', () => {
        const developer = defineRemoteAgent({ name: 'developer', peer: 'dev' });

        expect(developer.kind).toBe('remote');
        expect(developer.name).toBe('developer');
        expect(developer.definition.peer).toBe('dev');
        expect(developer.definition.agent).toBe('developer');
        expect(developer.definition.role).toBe('default');
        expect(developer.definition.timeoutMs).toBe(86_400_000);
        expect(REMOTE_TIMEOUT_DEFAULT_MS).toBe(86_400_000);
        expectTypeOf(developer).toEqualTypeOf<RemoteAgent>();
        expectTypeOf<RemoteAgent>().toExtend<Agent>();
    });

    it('keeps the given fields', () => {
        const schema = z.object({ ok: z.boolean() });
        const developer = defineRemoteAgent({
            name: 'developer',
            peer: 'dev',
            agent: 'maintainer',
            role: 'upgrade',
            description: 'Upgrades dependencies.',
            channels: [agent.on({ from: ['alfred'] })],
            output: schema,
            timeoutMs: 3_600_000,
            approvals: { channel: 'whatsapp', address: 'owner' },
            private: true,
            concurrencyMaxRuns: 2,
        });

        expect(developer.definition).toMatchObject({
            agent: 'maintainer',
            role: 'upgrade',
            description: 'Upgrades dependencies.',
            timeoutMs: 3_600_000,
            approvals: { channel: 'whatsapp', address: 'owner' },
            private: true,
            concurrencyMaxRuns: 2,
        });
        expect(developer.definition.output).toBe(schema);
        expect(defineRemoteAgent({
            name: 'd',
            peer: 'dev',
            timeoutMs: APPROVAL_TIMEOUT_MAX_MS,
        }).definition.timeoutMs)
            .toBe(APPROVAL_TIMEOUT_MAX_MS);
    });

    it.each([
        ['a bad peer name', { peer: 'Dev' }, /peer/],
        ['a peer name with a slash', { peer: 'dev/x' }, /peer/],
        ['no peer', { peer: undefined }, /peer/],
        ['a bad remote agent name', { agent: 'A b' }, /agent/],
        ['a bad role', { role: 'Role' }, /role/],
        ['timeoutMs 0', { timeoutMs: 0 }, /timeoutMs/],
        ['timeoutMs above the maximum', { timeoutMs: APPROVAL_TIMEOUT_MAX_MS + 1 }, /timeoutMs/],
        ['a fractional timeoutMs', { timeoutMs: 1.5 }, /timeoutMs/],
        ['a budget', { budget: { maxSteps: 3 } }, /"budget"/],
        ['a model', { model: {} as LanguageModel }, /"model"/],
        ['run', { run: () => 'x' }, /"run"/],
        ['tools', { tools: {} }, /"tools"/],
        ['instructions', { instructions: 'x' }, /"instructions"/],
        ['approvals without address', { approvals: { channel: 'console' } }, /approvals/],
        ['approvals without channel', { approvals: { address: 'owner' } }, /approvals/],
        ['an output that is no Standard Schema', { output: { parse: () => 1 } }, /output/],
        ['a duplicate subscription id', { channels: [agent.on(), agent.on()] }, /duplicate/],
    ])('refuses %s', (_, patch, message) => {
        const def = {
            name: 'developer',
            peer: 'dev',
            ...patch,
        } as unknown as RemoteAgentDefinition;

        expect(() => defineRemoteAgent(def)).toThrow(InvalidAgentDefinitionError);
        expect(() => defineRemoteAgent(def)).toThrow(message);
    });

    it('registers on an engine that knows the peer, without a model', async () => {
        const peers = fakePeers({ dev: {} });
        const developer = defineRemoteAgent({
            name: 'developer',
            peer: 'dev',
            channels: [agent.on()],
            approvals: { channel: 'console', address: 'owner' },
        });
        const engine = createTestEngine({
            services: createTestServices(),
            agents: [developer],
            channels: [agentChannel(), consoleChannel()],
            peers: peers.resolver,
        });

        expect(engine.peers).toBe(peers.resolver);
        expect(engine.getAgent('developer')).toBe(developer);
        expect(() => engine.checkAgent(defineRemoteAgent({ name: 'other', peer: 'dev' }))).not.toThrow();
        await expect(engine.putAgent(defineRemoteAgent({ name: 'other', peer: 'dev' }))).resolves.toBe('added');
    });

    it('refuses an unknown peer', async () => {
        const peers = fakePeers({ assistants: {} });
        const developer = defineRemoteAgent({ name: 'developer', peer: 'dev' });

        expect(() => createTestEngine({ agents: [developer], peers: peers.resolver }))
            .toThrow(/unknown peer "dev"/);

        const engine = createTestEngine({ peers: peers.resolver });

        expect(() => engine.checkAgent(developer)).toThrow(InvalidAgentDefinitionError);
        await expect(engine.putAgent(developer)).rejects.toThrow(/unknown peer "dev"/);
        expect(engine.getAgent('developer')).toBeUndefined();
    });

    it('refuses a remote agent on an engine without peers', async () => {
        const developer = defineRemoteAgent({ name: 'developer', peer: 'dev' });

        expect(() => createTestEngine({ agents: [developer] })).toThrow(InvalidAgentDefinitionError);
        expect(() => createTestEngine({ agents: [developer] })).toThrow(/peers/);
        await expect(createTestEngine().putAgent(developer)).rejects.toThrow(InvalidAgentDefinitionError);
    });

    it.each([
        ['an unregistered channel', [], /approvals channel "console"/],
        ['a channel without out', [inOnly('console')], /approvals channel "console"/],
    ])('refuses approvals through %s', (_, channels, message) => {
        const peers = fakePeers({ dev: {} });
        const developer = defineRemoteAgent({
            name: 'developer',
            peer: 'dev',
            approvals: { channel: 'console', address: 'owner' },
        });

        expect(() => createTestEngine({
            agents: [developer],
            channels,
            peers: peers.resolver,
        }))
            .toThrow(InvalidAgentDefinitionError);
        expect(() => createTestEngine({
            agents: [developer],
            channels,
            peers: peers.resolver,
        }))
            .toThrow(message);
    });

    it.each([
        ['run', { run: () => 'x' }],
        ['no peer', { peer: undefined }],
    ])('refuses a hand-built remote agent with %s', (_, patch) => {
        const base = defineRemoteAgent({ name: 'developer', peer: 'dev' });
        const broken = { ...base, definition: { ...base.definition, ...patch } } as unknown as Agent;
        const peers = fakePeers({ dev: {} });

        expect(() => createTestEngine({ agents: [broken], peers: peers.resolver })).toThrow(InvalidAgentDefinitionError);
    });

    it('fails a run of a remote agent instead of executing it as a model agent', async () => {
        const peers = fakePeers({ dev: {} });
        const developer = defineRemoteAgent({ name: 'developer', peer: 'dev' });
        const engine = createTestEngine({ agents: [developer], peers: peers.resolver });

        try {
            await engine.start();

            const { runId } = await engine.dispatch({
                agent: 'developer',
                channel: 'test',
                trigger: 'test',
                payload: {},
            });

            await engine.idle();

            const run = await engine.getRun(runId);

            expect(run?.status).toBe('failed');
            expect(run?.error?.message).toMatch(/remote agent/);
            expect(peers.calls.start).toHaveLength(0);
        } finally {
            await engine.stop();
        }
    });
});
