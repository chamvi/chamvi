/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunNotFoundError } from '@chamvi/core';
import type { IClock } from '@chamvi/core';
import type { Run } from '@chamvi/core-kit';
import { ForbiddenError } from '@chamvi/errors';
import { Permission } from '@chamvi/access';
import {
    agentResource,
    forbidden,
    isGranted,
    isGrantedSome,
} from '../../auth/helpers/index.ts';
import type { Principal } from '../../auth/types.ts';
import type { HttpAgents, HttpContext } from '../../app/types.ts';

/**
 * Whether the principal may read the content (runs, state) of the agent
 * named `agentName`: `chamvi_agent_read` for `{ name, private }`; a
 * registered agent that is not private also `chamvi_run_read` for
 * `{ agent }` or `chamvi_agent_run` for it. An agent the app does not hold
 * counts as private (fail closed: a removed private agent's runs stay
 * protected).
 */
export async function canReadAgentContent(principal: Principal, agentName: string, agents: HttpAgents, clock: IClock): Promise<boolean> {
    const agent = agents.get(agentName);
    const resource = agentResource(agentName, agent);

    if (await isGranted(principal, Permission.AGENT_READ, clock, resource)) {
        return true;
    }

    if (resource.private) {
        return false;
    }

    return await isGranted(principal, Permission.RUN_READ, clock, { agent: agentName }) ||
        await isGranted(principal, Permission.AGENT_RUN, clock, resource);
}

/** Whether the principal may read the run (`canReadAgentContent()` of its agent). */
export function canReadRun(principal: Principal, run: Run, agents: HttpAgents, clock: IClock): Promise<boolean> {
    return canReadAgentContent(principal, run.agent, agents, clock);
}

/** The app's agents, in registration order, whose runs the principal may read. */
export async function readableAgents(principal: Principal, agents: HttpAgents, clock: IClock): Promise<string[]> {
    const names = agents.names();
    const readable = await Promise.all(names.map((name) => canReadAgentContent(principal, name, agents, clock)));

    return names.filter((_name, index) => readable[index]);
}

/**
 * The run, once the principal may read it: 404 for a missing run and for
 * one of an agent the principal may not read under the private-agent rule
 * (the same error, so run ids are not probed), else 403.
 */
export async function loadReadableRun(ctx: Pick<HttpContext, 'runService' | 'agents' | 'clock'>, principal: Principal, id: string): Promise<Run> {
    const run = await ctx.runService.findOneOrFail(id);

    if (await canReadRun(principal, run, ctx.agents, ctx.clock)) {
        return run;
    }

    if (isContentProtected(run.agent, ctx.agents)) {
        throw new RunNotFoundError(id);
    }

    throw forbidden(Permission.RUN_READ);
}

/** A private agent, or one the app does not hold: only `chamvi_agent_read` reads it. */
function isContentProtected(agentName: string, agents: HttpAgents): boolean {
    return agentResource(agentName, agents.get(agentName)).private;
}

/** The grants that read some agent's runs: any one of them opens the listing. */
const RUN_LISTING_PERMISSIONS = [Permission.RUN_READ, Permission.AGENT_READ, Permission.AGENT_RUN] as const;

/**
 * The `agents` filter a run listing needs (`undefined`: none), else 403.
 * With `agent`, the principal must be able to read that agent's runs.
 * Without, an unrestricted `chamvi_agent_read` reads every run; any other
 * principal holding `chamvi_run_read`, `chamvi_agent_read` or
 * `chamvi_agent_run` for some resource gets the listing limited to
 * `readableAgents()`, in the one store query that keeps `total` and paging
 * exact.
 */
export async function assertCanListRuns(
    ctx: Pick<HttpContext, 'agents' | 'clock'>,
    principal: Principal,
    agent: string | undefined,
): Promise<readonly string[] | undefined> {
    if (agent !== undefined) {
        if (await canReadAgentContent(principal, agent, ctx.agents, ctx.clock)) {
            return undefined;
        }

        if (isContentProtected(agent, ctx.agents)) {
            throw new ForbiddenError({ message: `Reading runs of agent "${agent}" needs ${Permission.AGENT_READ}.` });
        }

        throw forbidden(Permission.RUN_READ);
    }

    if (await isGranted(principal, Permission.AGENT_READ, ctx.clock)) {
        return undefined;
    }

    for (const permission of RUN_LISTING_PERMISSIONS) {
        if (await isGrantedSome(principal, permission, ctx.clock)) {
            return readableAgents(principal, ctx.agents, ctx.clock);
        }
    }

    throw forbidden(Permission.RUN_READ);
}

/**
 * A run the principal may answer approvals of: 404 for a missing run (no
 * read permission needed), 403 without `chamvi_agent_approve` for its agent.
 */
export async function loadApprovableRun(ctx: Pick<HttpContext, 'runService' | 'agents' | 'clock'>, principal: Principal, id: string): Promise<Run> {
    const run = await ctx.runService.findOneOrFail(id);
    const resource = agentResource(run.agent, ctx.agents.get(run.agent));

    if (!await isGranted(principal, Permission.AGENT_APPROVE, ctx.clock, resource)) {
        throw forbidden(Permission.AGENT_APPROVE);
    }

    return run;
}
