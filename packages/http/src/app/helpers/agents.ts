/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import type { Agent, IEngine } from '@chamvi/core';
import type { HttpAgents } from '../types.ts';

/**
 * The engine's agents, or only the named ones (in the given order); a name the
 * engine lacks or a name given twice throws InvalidAgentDefinitionError.
 */
export function selectAgents(engine: IEngine, names?: readonly string[]): Agent[] {
    if (names === undefined) {
        return engine.listAgents();
    }

    const seen = new Set<string>();

    return names.map((name) => {
        if (seen.has(name)) {
            throw new InvalidAgentDefinitionError(`Agent "${name}" is named more than once.`);
        }

        seen.add(name);

        const agent = engine.getAgent(name);

        if (!agent) {
            throw new InvalidAgentDefinitionError(`The engine has no agent "${name}".`);
        }

        return agent;
    });
}

/**
 * The engine's agents, read on every call, or only the named ones the engine
 * holds then (checked by `selectAgents` at construction).
 */
export function createLiveAgents(engine: IEngine, names?: readonly string[]): HttpAgents {
    const served = names === undefined ? undefined : new Set(names);
    const list = (): Agent[] => {
        const agents = engine.listAgents();

        return served ? agents.filter((agent) => served.has(agent.name)) : agents;
    };

    return {
        get: (name) => (served && !served.has(name) ? undefined : engine.getAgent(name)),
        list,
        names: () => list().map((agent) => agent.name),
    };
}
