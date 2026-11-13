/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import type { Agent } from '@chamvi/core';
import type { Container } from 'validup';
import { assertGranted } from '../../auth/helpers.ts';
import type { Principal } from '../../auth/types.ts';
import { validateBody } from '../../request/helpers.ts';
import {
    assertCanReadState,
    assertCollection,
    createKvContainer,
    parseCollectionQuery,
    parseKvListQuery,
    requireAgent,
    serializeDoc,
} from '../helpers.ts';
import type {
    AgentStateServiceContext,
    IAgentStateService,
    KvEntry,
    KvView,
    KvWriteBody,
    StateDocumentView,
} from '../types.ts';

/** An agent's kv entries and document collections. */
export class AgentStateService implements IAgentStateService {
    protected ctx: AgentStateServiceContext;

    protected kvContainer: Container<KvWriteBody>;

    constructor(ctx: AgentStateServiceContext) {
        this.ctx = ctx;
        this.kvContainer = createKvContainer();
    }

    async list(name: string, query: URLSearchParams, principal: Principal): Promise<{ data: KvEntry[] }> {
        const agent = await this.readableAgent(name, principal, Permission.STATE_READ);

        return { data: await this.ctx.store.state.find(agent.name, parseKvListQuery(query)) };
    }

    async get(name: string, key: string, principal: Principal): Promise<KvView> {
        const agent = await this.readableAgent(name, principal, Permission.STATE_READ);
        const value = await this.ctx.store.state.findOne(agent.name, key);

        return { key, value: value ?? null };
    }

    async set(name: string, key: string, data: KvWriteBody, principal: Principal): Promise<KvView> {
        const agent = await this.readableAgent(name, principal, Permission.STATE_WRITE);
        const body = await validateBody(this.kvContainer, data);

        await this.ctx.store.state.set(agent.name, key, body.value);

        return { key, value: body.value };
    }

    async documents(name: string, collection: string, query: URLSearchParams, principal: Principal): Promise<{ data: StateDocumentView[] }> {
        const agent = await this.readableAgent(name, principal, Permission.STATE_READ);

        assertCollection(agent, collection);

        const docs = await this.ctx.store.state.findDocuments(agent.name, collection, parseCollectionQuery(query));

        return { data: docs.map(serializeDoc) };
    }

    /** `permission` for `{ name }` (403), the agent (404), then `chamvi_agent_read` for a private one (403). */
    protected async readableAgent(
        name: string,
        principal: Principal,
        permission: typeof Permission.STATE_READ | typeof Permission.STATE_WRITE,
    ): Promise<Agent> {
        await assertGranted(principal, this.ctx.clock, permission, { name });

        const agent = requireAgent(this.ctx.agents, name);

        await assertCanReadState(principal, agent, this.ctx.clock);

        return agent;
    }
}
