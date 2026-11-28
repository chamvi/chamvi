/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import { isActorGranted } from '../actor/helpers.ts';
import type { ActorContext } from '../actor/types.ts';
import type { Agent, IAgentRegistry } from '../agent/types.ts';

/**
 * The resource attributes of the agent `name` (`{ name, private }`): an
 * agent the registry does not hold counts as private, so a check fails closed.
 */
export function agentResource(name: string, agent: Agent | undefined): { name: string; private: boolean } {
    return { name, private: agent ? agent.definition.private === true : true };
}

/**
 * Whether the actor may read the content (runs, state) of the agent named
 * `agentName`: `chamvi_agent_read` for `{ name, private }`; a registered
 * agent that is not private also `chamvi_run_read` for `{ agent }` or
 * `chamvi_agent_run` for it. An agent the registry does not hold counts as
 * private (fail closed: a removed private agent's runs stay protected).
 */
export async function canReadAgentContent(actor: ActorContext<unknown>, agentName: string, agents: IAgentRegistry): Promise<boolean> {
    const agent = agents.get(agentName);
    const resource = agentResource(agentName, agent);

    if (await isActorGranted(actor, Permission.AGENT_READ, resource)) {
        return true;
    }

    if (resource.private) {
        return false;
    }

    return await isActorGranted(actor, Permission.RUN_READ, { agent: agentName }) ||
        await isActorGranted(actor, Permission.AGENT_RUN, resource);
}

/** The registry's agents, in registration order, whose content the actor may read. */
export async function readableAgents(actor: ActorContext<unknown>, agents: IAgentRegistry): Promise<string[]> {
    const names = agents.names();
    const readable = await Promise.all(names.map((name) => canReadAgentContent(actor, name, agents)));

    return names.filter((_name, index) => readable[index]);
}

/** A private agent, or one the registry does not hold: only `chamvi_agent_read` reads it. */
export function isAgentContentProtected(agentName: string, agents: IAgentRegistry): boolean {
    return agentResource(agentName, agents.get(agentName)).private;
}
