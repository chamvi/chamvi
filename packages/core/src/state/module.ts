/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IStateRepository } from '../repository/types.ts';
import { validate } from './helpers.ts';
import type { IAgentState, Infer, StateSchema } from './types.ts';

/**
 * Repository-backed IAgentState scoped to one agent. With a schema, collection
 * documents are validated (and stored as the schema's output) on upsert, and
 * only declared collections are writable; without one, nothing is validated.
 * `assertWritable` is called with the writer's name before every write (a
 * throw refuses it, nothing is stored); reads are never checked.
 */
export function createAgentState<S extends StateSchema = StateSchema>(
    agent: string,
    schema: S | undefined,
    store: IStateRepository,
    assertWritable?: (name: string) => void,
): IAgentState<S> {
    return {
        get: async <T = unknown>(key: string) => await store.findOne(agent, key) as T | undefined,
        set: async (key, value) => {
            assertWritable?.('state.set()');

            await store.set(agent, key, value);
        },
        collection: <K extends keyof S & string>(name: K) => ({
            list: async (q?: { where?: Partial<Infer<S[K]>>; limit?: number }) => {
                const rows = await store.findDocuments(agent, name, {
                    where: q?.where as Record<string, unknown> | undefined,
                    limit: q?.limit,
                });

                return rows.map(({ id, doc }) => ({ ...(doc as object), id }) as { id: string } & Infer<S[K]>);
            },
            upsert: async (id: string, doc: Infer<S[K]>) => {
                assertWritable?.(`state.collection("${name}").upsert()`);

                const value = await validate(agent, name, schema, doc);

                await store.upsertDocument(agent, name, id, value);
            },
            remove: async (id: string) => {
                assertWritable?.(`state.collection("${name}").remove()`);

                await store.deleteDocument(agent, name, id);
            },
        }),
    };
}
