/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import type { Agent, IClock } from '@chamvi/core';
import { ForbiddenError, NotFoundError } from '@ebec/http';
import { agentResource, isGranted } from '../../auth/helpers/index.ts';
import type { Principal } from '../../auth/types.ts';
import type { HttpAgents } from '../../app/types.ts';

/** The 404 of an agent this app does not serve. */
export function agentNotFound(name: string): NotFoundError {
    return new NotFoundError({ message: `Agent "${name}" was not found.` });
}

/** The agent by name, else 404. */
export function requireAgent(agents: HttpAgents, name: string): Agent {
    const agent = agents.get(name);

    if (!agent) {
        throw agentNotFound(name);
    }

    return agent;
}

/** 403 for a private agent's state unless the principal holds `chamvi_agent_read` for it. */
export async function assertCanReadState(principal: Principal, agent: Agent, clock: IClock): Promise<void> {
    if (agent.definition.private !== true) {
        return;
    }

    if (!await isGranted(principal, Permission.AGENT_READ, clock, agentResource(agent.name, agent))) {
        throw new ForbiddenError({ message: `State of agent "${agent.name}" needs ${Permission.AGENT_READ}.` });
    }
}

/** 404 when the agent declares state collections and this is none of them. */
export function assertCollection(agent: Agent, collection: string): void {
    const declared = agent.definition.state;

    if (declared && !Object.hasOwn(declared, collection)) {
        throw new NotFoundError({ message: `Agent "${agent.name}" declares no state collection "${collection}".` });
    }
}
