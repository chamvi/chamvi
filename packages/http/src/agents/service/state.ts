/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ActorContext, AgentScope } from '@chamvi/core';
import type { KvWriteBody } from '@chamvi/core-kit';
import { buildActorContext } from '../../auth/helpers/index.ts';
import type { Principal } from '../../auth/types.ts';
import { parseCollectionQuery, parseKvListQuery, serializeDoc } from '../helpers/index.ts';
import type {
    AgentStateServiceContext,
    IAgentStateService,
    KvEntry,
    KvView,
    StateDocumentView,
} from '../types.ts';

/** An agent's kv entries and document collections, checked by core's `StateService`. */
export class AgentStateService implements IAgentStateService {
    protected ctx: AgentStateServiceContext;

    constructor(ctx: AgentStateServiceContext) {
        this.ctx = ctx;
    }

    async list(name: string, query: URLSearchParams, principal: Principal): Promise<{ data: KvEntry[] }> {
        // the query is parsed after the checks, so its 400 follows the 403 and 404
        return { data: await this.ctx.stateService.getMany(name, () => parseKvListQuery(query), this.actor(principal), this.scope()) };
    }

    async get(name: string, key: string, principal: Principal): Promise<KvView> {
        const value = await this.ctx.stateService.getOne(name, key, this.actor(principal), this.scope());

        return { key, value: value ?? null };
    }

    async set(name: string, key: string, data: KvWriteBody, principal: Principal): Promise<KvView> {
        const value = await this.ctx.stateService.save(name, key, data, this.actor(principal), this.scope());

        return { key, value };
    }

    async documents(name: string, collection: string, query: URLSearchParams, principal: Principal): Promise<{ data: StateDocumentView[] }> {
        const docs = await this.ctx.stateService.getDocuments(
            name,
            collection,
            () => parseCollectionQuery(query),
            this.actor(principal),
            this.scope(),
        );

        return { data: docs.map(serializeDoc) };
    }

    /** The actor core's state service checks the principal with. */
    protected actor(principal: Principal): ActorContext {
        return buildActorContext(principal, this.ctx.clock);
    }

    /** The app's allowlisted agents: an agent outside them counts as private. */
    protected scope(): AgentScope {
        return { agents: this.ctx.agents };
    }
}
