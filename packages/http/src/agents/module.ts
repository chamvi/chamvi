/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import type { Agent } from '@chamvi/core';
import { defineCoreHandler } from 'routup';
import type { App, IAppEvent } from 'routup';
import type { HttpContext } from '../app/types.ts';
import { authorize, isGranted } from '../auth/helpers.ts';
import type { Principal } from '../auth/types.ts';
import { isWebhookChannel } from '../channels/helpers.ts';
import { readJsonBody, validateBody } from '../request/helpers.ts';
import {
    assertCanReadState,
    assertCollection,
    createKvContainer,
    listSchedules,
    parseCollectionQuery,
    parseKvListQuery,
    requireAgent,
    serializeDoc,
    summarizeAgent,
} from './helpers.ts';

function param(event: IAppEvent, name: string): string {
    return event.params[name] ?? '';
}

/** The agents whose runs the principal may read (`chamvi_run_read` for `{ agent }`), in registration order. */
async function listedAgents(ctx: HttpContext, principal: Principal): Promise<Agent[]> {
    const agents = ctx.agents.list();
    const granted = await Promise.all(agents.map((agent) => isGranted(principal, Permission.RUN_READ, ctx.clock, { agent: agent.name })));

    return agents.filter((_agent, index) => granted[index]);
}

/**
 * `GET /agents`, `GET /schedules`, `GET /agents/:name/state/kv`, `GET/PATCH /agents/:name/state/kv/:key`
 * and `GET /agents/:name/state/collections/:collection`.
 */
export function registerAgentRoutes(app: App, ctx: HttpContext): void {
    const kvContainer = createKvContainer();

    app.get('/agents', defineCoreHandler(async (event) => {
        const principal = await authorize(event, ctx, Permission.RUN_READ);
        const hookChannels = new Set(ctx.channels.filter(isWebhookChannel).map((channel) => channel.name));

        const issues = ctx.agentIssues();
        // an issue names an agent and its load error: the same row check as the agents
        const reached = await Promise.all(issues.map((issue) => isGranted(principal, Permission.RUN_READ, ctx.clock, { agent: issue.agent })));

        return {
            data: (await listedAgents(ctx, principal)).map((agent) => summarizeAgent(agent, ctx.basePath, hookChannels)),
            issues: issues.filter((_issue, index) => reached[index]),
        };
    }));

    app.get('/schedules', defineCoreHandler(async (event) => {
        const principal = await authorize(event, ctx, Permission.RUN_READ);

        return { data: listSchedules(await listedAgents(ctx, principal), ctx.clock.now()) };
    }));

    app.get('/agents/:name/state/kv', defineCoreHandler(async (event) => {
        const name = param(event, 'name');
        const principal = await authorize(event, ctx, Permission.STATE_READ, { name });
        const agent = requireAgent(ctx.agents, name);

        await assertCanReadState(principal, agent, ctx.clock);

        return { data: await ctx.store.state.find(agent.name, parseKvListQuery(event.searchParams)) };
    }));

    app.get('/agents/:name/state/kv/:key', defineCoreHandler(async (event) => {
        const name = param(event, 'name');
        const principal = await authorize(event, ctx, Permission.STATE_READ, { name });
        const agent = requireAgent(ctx.agents, name);

        await assertCanReadState(principal, agent, ctx.clock);

        const key = param(event, 'key');
        const value = await ctx.store.state.findOne(agent.name, key);

        return { key, value: value ?? null };
    }));

    app.patch('/agents/:name/state/kv/:key', defineCoreHandler(async (event) => {
        const name = param(event, 'name');
        const principal = await authorize(event, ctx, Permission.STATE_WRITE, { name });
        const agent = requireAgent(ctx.agents, name);

        await assertCanReadState(principal, agent, ctx.clock);

        const key = param(event, 'key');
        const body = await validateBody(kvContainer, await readJsonBody(event, ctx.bodyLimit), { required: true });

        await ctx.store.state.set(agent.name, key, body.value);

        return { key, value: body.value };
    }));

    app.get('/agents/:name/state/collections/:collection', defineCoreHandler(async (event) => {
        const name = param(event, 'name');
        const principal = await authorize(event, ctx, Permission.STATE_READ, { name });
        const agent = requireAgent(ctx.agents, name);

        await assertCanReadState(principal, agent, ctx.clock);

        const collection = param(event, 'collection');

        assertCollection(agent, collection);

        const query = parseCollectionQuery(event.searchParams);
        const docs = await ctx.store.state.findDocuments(agent.name, collection, query);

        return { data: docs.map(serializeDoc) };
    }));
}
