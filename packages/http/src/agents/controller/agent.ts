/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    DBody,
    DContext,
    DController,
    DGet,
    DPatch,
    DPath,
    DSecurity,
    DTags,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import { usePrincipal } from '../../auth/helpers.ts';
import { DQuerySchema } from '../../decorators/index.ts';
import { ForceLoggedInMiddleware, RequiredJsonBodyMiddleware } from '../../middleware/index.ts';
import type {
    AgentControllerContext,
    AgentListView,
    IAgentService,
    IAgentStateService,
    KvEntry,
    KvView,
    KvWriteBody,
    StateDocumentView,
} from '../types.ts';

@DTags('agent')
@DSecurity([], 'bearer')
@DController('/agents')
export class AgentController {
    protected service: IAgentService;

    protected state: IAgentStateService;

    constructor(ctx: AgentControllerContext) {
        this.service = ctx.service;
        this.state = ctx.state;
    }

    /** The agents, and their load issues, whose runs the caller may read. */
    @DGet('', [ForceLoggedInMiddleware])
    async list(@DContext() event: IAppEvent): Promise<AgentListView> {
        return this.service.list(await usePrincipal(event));
    }

    /** A page of the agent's key-value entries, in key order. */
    @DGet('/:name/state/kv', [ForceLoggedInMiddleware])
    @DQuerySchema('kv')
    async listKv(
        @DPath('name') name: string,
        @DContext() event: IAppEvent,
    ): Promise<{ data: KvEntry[] }> {
        return this.state.list(name, event.searchParams, await usePrincipal(event));
    }

    /** The key's value, `null` when unset. */
    @DGet('/:name/state/kv/:key', [ForceLoggedInMiddleware])
    async getKv(
        @DPath('name') name: string,
        @DPath('key') key: string,
        @DContext() event: IAppEvent,
    ): Promise<KvView> {
        return this.state.get(name, key, await usePrincipal(event));
    }

    /** Writes `value` under the key. */
    @DPatch('/:name/state/kv/:key', [ForceLoggedInMiddleware, RequiredJsonBodyMiddleware])
    async setKv(
        @DPath('name') name: string,
        @DPath('key') key: string,
        @DBody() data: KvWriteBody,
        @DContext() event: IAppEvent,
    ): Promise<KvView> {
        return this.state.set(name, key, data, await usePrincipal(event));
    }

    /**
     * The collection's documents matching top-level equality filters. The
     * filters also read the expression form,
     * `filter=and(eq(color,'red'),eq(qty,'3'))`, which cannot be mixed with the bracket form.
     */
    @DGet('/:name/state/collections/:collection', [ForceLoggedInMiddleware])
    @DQuerySchema('documents')
    async listDocuments(
        @DPath('name') name: string,
        @DPath('collection') collection: string,
        @DContext() event: IAppEvent,
    ): Promise<{ data: StateDocumentView[] }> {
        return this.state.documents(name, collection, event.searchParams, await usePrincipal(event));
    }
}
