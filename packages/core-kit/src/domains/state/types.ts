/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** One key of an agent's key-value state. */
export type StateEntry = {
    /** The row's storage id (a uuid), kept by every later `upsert` of the same `(agent, key)`. */
    id: string;
    agent: string;
    key: string;
    value: unknown;
};

/** One document of an agent's state collection. */
export type StateDocument = {
    /** The row's storage id (a uuid), kept by every later `upsert` of the same document. */
    id: string;
    agent: string;
    collection: string;
    /** The document's id within its collection. */
    documentId: string;
    doc: unknown;
};

/** `PATCH /agents/{name}/state/kv/{key}`: any value but `undefined`. */
export type KvWriteBody = {
    value: unknown;
};
