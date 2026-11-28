/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { PermissionBinding } from '@chamvi/access';
import { HolderPermissionEvaluator, Permission } from '@chamvi/access';
import { NotFoundError } from '@chamvi/errors';
import type { ActorContext, Agent, IAgentRegistry } from '@chamvi/core';
import {
    agentNotFound,
    agentResource,
    canReadAgentContent,
    defineSimpleAgent,
    isAgentContentProtected,
    readableAgents,
    requireAgent,
} from '@chamvi/core';

function registryOf(...agents: Agent[]): IAgentRegistry {
    return {
        get: (name) => agents.find((agent) => agent.name === name),
        names: () => agents.map((agent) => agent.name),
    };
}

function agentOf(name: string, isPrivate = false): Agent {
    return defineSimpleAgent({
        name,
        run: () => undefined,
        ...(isPrivate ? { private: true } : {}),
    });
}

function bound(name: string, query?: Record<string, unknown>): PermissionBinding {
    return {
        permission: { name },
        ...(query ? { policies: [{ type: 'attributes', query } as never] } : {}),
    };
}

function actorOf(...bindings: PermissionBinding[]): ActorContext {
    return {
        permissionEvaluator: new HolderPermissionEvaluator(
            { bindings },
            { now: () => new Date(2026, 10, 11, 10, 0) },
        ),
    };
}

const PUBLIC = agentOf('echo');
const SECRET = agentOf('secret', true);
const agents = registryOf(PUBLIC, SECRET);

describe('agentResource', () => {
    it('reads private from the definition, an absent agent as private', () => {
        expect(agentResource('echo', PUBLIC)).toEqual({ name: 'echo', private: false });
        expect(agentResource('secret', SECRET)).toEqual({ name: 'secret', private: true });
        expect(agentResource('gone', undefined)).toEqual({ name: 'gone', private: true });
    });
});

describe('requireAgent', () => {
    it('returns the agent, else the 404 of its name', () => {
        expect(requireAgent(agents, 'echo')).toBe(PUBLIC);
        expect(() => requireAgent(agents, 'gone')).toThrow(NotFoundError);
        expect(() => requireAgent(agents, 'gone')).toThrow('Agent "gone" was not found.');
        expect(agentNotFound('x').message).toBe('Agent "x" was not found.');
    });
});

describe('canReadAgentContent', () => {
    it('reads with chamvi_agent_read on { name, private }', async () => {
        expect(await canReadAgentContent(actorOf(bound(Permission.AGENT_READ, { name: 'echo', private: false })), 'echo', agents)).toBe(true);
        expect(await canReadAgentContent(actorOf(bound(Permission.AGENT_READ, { name: 'secret', private: true })), 'secret', agents)).toBe(true);
        expect(await canReadAgentContent(actorOf(bound(Permission.AGENT_READ, { private: false })), 'secret', agents)).toBe(false);
    });

    it('reads a public agent with chamvi_run_read { agent } or chamvi_agent_run', async () => {
        expect(await canReadAgentContent(actorOf(bound(Permission.RUN_READ, { agent: 'echo' })), 'echo', agents)).toBe(true);
        expect(await canReadAgentContent(actorOf(bound(Permission.RUN_READ, { agent: 'other' })), 'echo', agents)).toBe(false);
        expect(await canReadAgentContent(actorOf(bound(Permission.AGENT_RUN, { name: 'echo' })), 'echo', agents)).toBe(true);
        expect(await canReadAgentContent(actorOf(), 'echo', agents)).toBe(false);
    });

    it('reads a private or unknown agent with chamvi_agent_read only', async () => {
        const others = actorOf(bound(Permission.RUN_READ), bound(Permission.AGENT_RUN));

        expect(await canReadAgentContent(others, 'secret', agents)).toBe(false);
        expect(await canReadAgentContent(others, 'gone', agents)).toBe(false);
        expect(await canReadAgentContent(actorOf(bound(Permission.AGENT_READ)), 'gone', agents)).toBe(true);
    });

    it('decides by the registry it is given', async () => {
        const outside = agentOf('outside');
        const actor = actorOf(bound(Permission.RUN_READ));

        expect(await canReadAgentContent(actor, 'outside', registryOf(PUBLIC, outside))).toBe(true);
        expect(await canReadAgentContent(actor, 'outside', agents)).toBe(false);
        expect(isAgentContentProtected('outside', registryOf(PUBLIC, outside))).toBe(false);
        expect(isAgentContentProtected('outside', agents)).toBe(true);
    });
});

describe('isAgentContentProtected', () => {
    it('protects a private agent and an unknown name', () => {
        expect(isAgentContentProtected('echo', agents)).toBe(false);
        expect(isAgentContentProtected('secret', agents)).toBe(true);
        expect(isAgentContentProtected('gone', agents)).toBe(true);
    });
});

describe('readableAgents', () => {
    it('keeps the registry order', async () => {
        const registry = registryOf(agentOf('zeta'), SECRET, agentOf('alpha'), PUBLIC);

        expect(await readableAgents(actorOf(bound(Permission.RUN_READ)), registry)).toEqual(['zeta', 'alpha', 'echo']);
        expect(await readableAgents(actorOf(bound(Permission.AGENT_READ)), registry)).toEqual(['zeta', 'secret', 'alpha', 'echo']);
        expect(await readableAgents(actorOf(), registry)).toEqual([]);
    });
});
