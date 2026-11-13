/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import type { Agent } from '@chamvi/core';
import { assertGranted, isGranted } from '../../auth/helpers.ts';
import type { Principal } from '../../auth/types.ts';
import { isWebhookChannel } from '../../channels/helpers.ts';
import { listSchedules, summarizeAgent } from '../helpers.ts';
import type {
    AgentListView,
    AgentServiceContext,
    IAgentService,
    ScheduleSummary,
} from '../types.ts';

/** The agent inventory and the schedules, each row filtered by `chamvi_run_read` for `{ agent }`. */
export class AgentService implements IAgentService {
    protected ctx: AgentServiceContext;

    constructor(ctx: AgentServiceContext) {
        this.ctx = ctx;
    }

    async list(principal: Principal): Promise<AgentListView> {
        await assertGranted(principal, this.ctx.clock, Permission.RUN_READ);

        const hookChannels = new Set(this.ctx.channels.filter(isWebhookChannel).map((channel) => channel.name));
        const issues = this.ctx.agentIssues();
        // an issue names an agent and its load error: the same row check as the agents
        const reached = await Promise.all(issues.map((issue) => isGranted(principal, Permission.RUN_READ, this.ctx.clock, { agent: issue.agent })));

        return {
            data: (await this.listedAgents(principal)).map((agent) => summarizeAgent(agent, this.ctx.basePath, hookChannels)),
            issues: issues.filter((_issue, index) => reached[index]),
        };
    }

    async schedules(principal: Principal): Promise<{ data: ScheduleSummary[] }> {
        await assertGranted(principal, this.ctx.clock, Permission.RUN_READ);

        return { data: listSchedules(await this.listedAgents(principal), this.ctx.clock.now()) };
    }

    /** The agents whose runs the principal may read (`chamvi_run_read` for `{ agent }`), in registration order. */
    protected async listedAgents(principal: Principal): Promise<Agent[]> {
        const agents = this.ctx.agents.list();
        const granted = await Promise.all(agents.map((agent) => isGranted(principal, Permission.RUN_READ, this.ctx.clock, { agent: agent.name })));

        return agents.filter((_agent, index) => granted[index]);
    }
}
