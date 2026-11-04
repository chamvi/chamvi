/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    AGENT_CHANNEL_NAME,
    DEFAULT_DISPATCH_MAX_DEPTH,
    DEFAULT_DISPATCH_ROLE,
    DEFAULT_DISPATCH_WAIT_TIMEOUT_MS,
    DEFAULT_MAX_DISPATCHES_PER_RUN,
    DISPATCH_DEPTH_MAX,
    Engine,
    InvalidAgentDefinitionError,
    agent,
    agentChannel,
    defineAgent,
} from '@chamvi/core';
import type { ChannelSubscription } from '@chamvi/core';
import { createMemoryStore } from '../../../src/repository/index.ts';
import { mockModel } from '../../utils/mock-model.ts';

const define = (channels: ChannelSubscription<any>[]) => defineAgent({
    name: 'maintainer',
    instructions: 'You maintain.',
    model: mockModel([]),
    channels,
});

describe('agent.on()', () => {
    it('defaults to role "default"', () => {
        expect(agent.on()).toMatchObject({
            channel: 'agent',
            id: 'default',
            options: { maxPerRun: 100, maxDepth: 1 },
        });
        expect(AGENT_CHANNEL_NAME).toBe('agent');
        expect(DEFAULT_DISPATCH_ROLE).toBe('default');
        expect(DEFAULT_MAX_DISPATCHES_PER_RUN).toBe(100);
        expect(DEFAULT_DISPATCH_MAX_DEPTH).toBe(1);
        expect(DISPATCH_DEPTH_MAX).toBe(8);
        expect(DEFAULT_DISPATCH_WAIT_TIMEOUT_MS).toBe(86_400_000);
    });

    it('keeps the given options and key functions', () => {
        const concurrencyKey = (p: { pr: string }) => p.pr;
        const subscription = agent.on({
            role: 'hunt',
            maxPerRun: 3,
            maxDepth: 2,
            from: ['auditor'],
            concurrencyKey,
        });

        expect(subscription.id).toBe('hunt');
        expect(subscription.options).toMatchObject({
            maxPerRun: 3,
            maxDepth: 2,
            from: ['auditor'],
        });
        expect(subscription.concurrencyKey).toBe(concurrencyKey);
        expect(subscription).not.toHaveProperty('idempotencyKey');
    });

    it('copies the address hook and keeps the description', () => {
        const address = (p: { pr: string }) => p.pr;
        const subscription = agent.on({
            role: 'pr',
            address,
            description: 'Reviews one pull request.',
        });

        expect(subscription.address).toBe(address);
        expect(subscription.options).toMatchObject({ description: 'Reviews one pull request.' });
        expect(agent.on()).not.toHaveProperty('address');
        expect(agent.on().options).not.toHaveProperty('description');
    });

    it.each(['', ' '.repeat(3), 5])('refuses the description %j', (value) => {
        expect(() => agent.on({ description: value as string })).toThrow(InvalidAgentDefinitionError);
        expect(() => agent.on({ description: value as string })).toThrow(/description/);
    });

    it.each([0, 1.5, '3', -1])('maxPerRun must be a positive integer (%s)', (value) => {
        expect(() => agent.on({ maxPerRun: value as number })).toThrow(InvalidAgentDefinitionError);
        expect(() => agent.on({ maxPerRun: value as number })).toThrow(/maxPerRun/);
    });

    it.each([0, 9, 1.5])('refuses maxDepth %s', (value) => {
        expect(() => agent.on({ maxDepth: value })).toThrow(InvalidAgentDefinitionError);
        expect(() => agent.on({ maxDepth: value })).toThrow(/maxDepth/);
    });

    it('accepts maxDepth 8', () => {
        expect(agent.on({ maxDepth: 8 }).options.maxDepth).toBe(8);
    });

    it.each(['Hunt', 'a b', '', 'x'.repeat(65), 5])('refuses a role that breaks the channel-name rule (%j)', (role) => {
        expect(() => agent.on({ role: role as string })).toThrow(InvalidAgentDefinitionError);
    });

    it.each([[['Auditor']], [['a_b']], [['']], ['auditor'], [[5]]])('refuses a from entry that breaks the agent-name rule (%j)', (from) => {
        expect(() => agent.on({ from: from as string[] })).toThrow(InvalidAgentDefinitionError);
        expect(() => agent.on({ from: from as string[] })).toThrow(/from/);
    });

    it('copies from', () => {
        const from = ['auditor'];
        const subscription = agent.on({ from });

        from.push('other');
        expect(subscription.options.from).toEqual(['auditor']);
    });

    it('defineAgent refuses two subscriptions with one role', () => {
        expect(() => define([agent.on(), agent.on()])).toThrow(InvalidAgentDefinitionError);
        expect(() => define([agent.on({ role: 'hunt' }), agent.on({ role: 'hunt' })])).toThrow(/duplicate subscription id "hunt"/);
        expect(() => define([agent.on({ role: 'hunt' }), agent.on({ role: 'verify' })])).not.toThrow();
    });

    it('defineAgent refuses a role named like another subscription id', () => {
        const httpOn: ChannelSubscription = {
            channel: 'http',
            id: 'http',
            options: {},
        };

        expect(() => define([httpOn, agent.on({ role: 'http' })])).toThrow(/duplicate subscription id "http"/);
    });

    it('an agent subscribing without agentChannel() is refused', () => {
        const store = createMemoryStore();

        expect(() => new Engine({
            store,
            agents: [define([agent.on()])],
            channels: [],
        })).toThrow(/unknown channel "agent"/);
        expect(() => new Engine({
            store,
            agents: [define([agent.on()])],
            channels: [agentChannel()],
        })).not.toThrow();
    });

    it.each([
        [{ maxPerRun: 0 }, /maxPerRun/],
        [{ maxDepth: 9 }, /maxDepth/],
        [{ maxDepth: 0 }, /maxDepth/],
        [{ from: ['A'] }, /from/],
        [{ description: 5 }, /description/],
        [{ description: '' }, /description/],
        [{ description: '  ' }, /description/],
    ])('the engine refuses a hand-built role with %j', (options, message) => {
        const subscription: ChannelSubscription = {
            channel: 'agent',
            id: 'hunt',
            options,
        };

        expect(() => new Engine({
            store: createMemoryStore(),
            agents: [define([subscription])],
            channels: [agentChannel()],
        })).toThrow(message);
    });

    it('the engine refuses a hand-built role id that breaks the channel-name rule', () => {
        const subscription: ChannelSubscription = {
            channel: 'agent',
            id: 'Hunt',
            options: {},
        };

        expect(() => new Engine({
            store: createMemoryStore(),
            agents: [define([subscription])],
            channels: [agentChannel()],
        })).toThrow(InvalidAgentDefinitionError);
    });

    it('refuses a role hook that is no function', () => {
        expect(() => agent.on({ role: 'pr', address: 'o/r#1' as never })).toThrow('agent.on(): address must be a function.');
        expect(() => agent.on({ role: 'pr', concurrencyKey: 1 as never })).toThrow(InvalidAgentDefinitionError);
        expect(() => new Engine({
            store: createMemoryStore(),
            agents: [define([{
                channel: 'agent',
                id: 'pr',
                options: {},
                idempotencyKey: 'k' as never,
            }])],
            channels: [agentChannel()],
        })).toThrow('Agent "maintainer" role "pr": idempotencyKey must be a function.');
    });

    it('agentChannel() has neither in nor out', () => {
        const channel = agentChannel();

        expect(channel.name).toBe('agent');
        expect(channel.in).toBeUndefined();
        expect(channel.out).toBeUndefined();
        expect(channel.start).toBeUndefined();
    });
});
