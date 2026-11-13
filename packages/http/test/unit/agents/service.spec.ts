/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission } from '@chamvi/access';
import { defineModelAgent } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { ControllableClock } from '@chamvi/test-kit';
import { AgentService } from '../../../src/agents/service/index.ts';
import { cronOn, restricted } from '../../utils/app.ts';
import { inventoryAgents } from '../../utils/agents.ts';
import { textModel } from '../../utils/model.ts';
import { principalOf } from '../../utils/principal.ts';

function setup() {
    const clock = new ControllableClock(new Date(1_000_000));
    const agents: Agent[] = [
        ...inventoryAgents(),
        defineModelAgent({
            name: 'sweep',
            model: textModel(),
            instructions: 'Sweep.',
            channels: [cronOn('0 * * * *')],
        }),
    ];
    const issues = [
        {
            agent: 'echo',
            message: 'broken',
            at: new Date(0),
        },
        {
            agent: 'gone',
            message: 'missing',
            at: new Date(0),
        },
    ];
    const service = new AgentService({
        agents: {
            get: (name) => agents.find((agent) => agent.name === name),
            list: () => [...agents],
            names: () => agents.map((agent) => agent.name),
        },
        agentIssues: () => issues,
        channels: [],
        basePath: '',
        clock,
    });

    return { service, issues };
}

describe('AgentService', () => {
    it('lists every agent and issue for an unrestricted run reader', async () => {
        const { service, issues } = setup();
        const view = await service.list(principalOf({ permission: { name: Permission.RUN_READ } }));

        expect(view.data.map((agent) => agent.name)).toEqual(['echo', 'intake', 'sweep']);
        expect(view.issues).toEqual(issues);
    });

    it('filters agents and issues by chamvi_run_read per agent', async () => {
        const { service, issues } = setup();
        const view = await service.list(principalOf(restricted(Permission.RUN_READ, { agent: 'echo' })));

        expect(view.data.map((agent) => agent.name)).toEqual(['echo']);
        expect(view.issues).toEqual([issues[0]]);
    });

    it('refuses list and schedules without chamvi_run_read', async () => {
        const { service } = setup();
        const principal = principalOf({ permission: { name: Permission.STATE_READ } });

        await expect(service.list(principal)).rejects.toMatchObject({ status: 403 });
        await expect(service.schedules(principal)).rejects.toMatchObject({ status: 403 });
    });

    it('lists the schedules of the agents the principal reads', async () => {
        const { service } = setup();
        const all = await service.schedules(principalOf({ permission: { name: Permission.RUN_READ } }));

        expect(all.data.map((schedule) => schedule.agent)).toEqual(['sweep']);

        const echoOnly = await service.schedules(principalOf(restricted(Permission.RUN_READ, { agent: 'echo' })));

        expect(echoOnly).toEqual({ data: [] });
    });
});
