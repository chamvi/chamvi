/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IEntityRepository } from '../entity/types.ts';

/**
 * The revision marker of a folder agent: the content hash of its folder
 * (never its code) and when that hash was recorded.
 */
export type AgentRevision = {
    agent: string;
    hash: string;
    changedAt: Date;
};

/** A stored revision marker: the marker and the row's storage id. */
export type AgentRevisionRecord = AgentRevision & {
    /** The row's storage id (a uuid), kept by every later `upsert` of the same `agent`. */
    id: string;
};

/**
 * The agent revision port: the generic entity port on
 * `AgentRevisionRecord` (key `id`, `agent` unique). `upsert` inserts, or
 * replaces the `hash` and `changedAt` of the row with the same `agent`
 * and keeps its stored `id`: the value it resolves (and every later read)
 * carries the stored `id`, not the one given. A sort by `agent` orders by
 * code point.
 */
export interface IAgentRevisionRepository extends IEntityRepository<AgentRevisionRecord> {}
