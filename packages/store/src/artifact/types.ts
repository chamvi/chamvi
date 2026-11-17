/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IEntityRepository } from '../entity/types.ts';

/** Metadata of a file stored for a run (an attachment or a tool output); the bytes are read separately. */
export type Artifact = {
    id: string;
    runId: string;
    agent: string;
    mediaType: string;
    filename?: string;
    /** Byte length of the data. */
    size: number;
    createdAt: Date;
};

/**
 * A stored artifact: the metadata, and beside it the two write-only
 * properties of the row. A read never returns either.
 */
export type ArtifactRecord = Artifact & {
    /** The private write identity within the run (unique per `runId`); matched by a where, never read back. */
    key?: string;
    /** The bytes `save`/`upsert` write when set; read only through `readData`. */
    data?: Uint8Array;
};

/**
 * The artifact port: the generic entity port on `ArtifactRecord` (key
 * `id`, `(runId, key)` unique, no reference to the run: attachments are
 * stored before their run). Reads return the metadata only: `key` and
 * `data` are written by `save`/`upsert` and never returned; a where may
 * name `key`. The bytes are read with `readData`.
 */
export interface IArtifactRepository extends IEntityRepository<ArtifactRecord> {
    /** The bytes of the artifact with this id, as a plain `Uint8Array`, or `null`. Locks nothing. */
    readData(id: string): Promise<Uint8Array | null>;
}
