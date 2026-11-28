/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { NotFoundError } from '@chamvi/errors';
import type { Agent, IAgentRegistry } from './types.ts';

/** The 404 of an agent the registry does not hold. */
export function agentNotFound(name: string): NotFoundError {
    return new NotFoundError({ message: `Agent "${name}" was not found.` });
}

/** The agent by name, else 404. */
export function requireAgent(agents: IAgentRegistry, name: string): Agent {
    const agent = agents.get(name);

    if (!agent) {
        throw agentNotFound(name);
    }

    return agent;
}
