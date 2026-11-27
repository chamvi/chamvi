/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

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

/** A file to store: an attachment at dispatch or a tool's `artifacts.put()`. */
export type ArtifactInput = {
    /**
     * `artifacts.put()` only (a dispatch attachment takes none): a stable name
     * within the run, 1 to 255 characters without NUL. A repeated put with that
     * key replaces the artifact and keeps its id. The key is private to the
     * store and never part of an `Artifact`.
     */
    key?: string;
    /** `type/subtype`, e.g. `image/png`. */
    mediaType: string;
    filename?: string;
    data: Uint8Array;
};
