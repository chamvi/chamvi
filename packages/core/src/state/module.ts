/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { validateStateDocument } from './helpers.ts';
import type { 
    IAgentState, 
    IStateService, 
    Infer, 
    StateSchema,  
} from './types.ts';

/** What an agent's state (`createAgentState()`) needs of the state service. */
type AgentStateService = Pick<IStateService, 'findOne' | 'set' | 'findDocuments' | 'upsertDocument' | 'deleteDocument'>;

/**
 * Service-backed IAgentState scoped to one agent. With a schema, collection
 * documents are validated (and stored as the schema's output) on upsert, and
 * only declared collections are writable; without one, nothing is validated.
 */
export function createAgentState<S extends StateSchema = StateSchema>(
    agent: string,
    schema: S | undefined,
    state: AgentStateService,
): IAgentState<S> {
    return createGuardedAgentState(agent, schema, state, () => {});
}

/**
 * createAgentState() with `assertWritable` called with the writer's name
 * before every write (internal: an execution's ToolContext); a throw refuses
 * it and nothing is stored. Reads are never checked.
 */
export function createGuardedAgentState<S extends StateSchema = StateSchema>(
    agent: string,
    schema: S | undefined,
    state: AgentStateService,
    assertWritable: (name: string) => void,
): IAgentState<S> {
    return {
        get: async <T = unknown>(key: string) => await state.findOne(agent, key) as T | undefined,
        set: async (key, value) => {
            assertWritable('state.set()');

            await state.set(agent, key, value);
        },
        collection: <K extends keyof S & string>(name: K) => ({
            list: async (q?: { where?: Partial<Infer<S[K]>>; limit?: number }) => {
                const rows = await state.findDocuments(agent, name, {
                    where: q?.where as Record<string, unknown> | undefined,
                    limit: q?.limit,
                });

                return rows.map(({ id, doc }) => ({ ...(doc as object), id }) as { id: string } & Infer<S[K]>);
            },
            upsert: async (id: string, doc: Infer<S[K]>) => {
                assertWritable(`state.collection("${name}").upsert()`);

                const value = await validateStateDocument(agent, name, schema, doc);

                // the execution may have ended during an async validation
                assertWritable(`state.collection("${name}").upsert()`);

                await state.upsertDocument(agent, name, id, value);
            },
            remove: async (id: string) => {
                assertWritable(`state.collection("${name}").remove()`);

                await state.deleteDocument(agent, name, id);
            },
        }),
    };
}
