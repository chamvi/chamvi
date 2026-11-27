/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

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
