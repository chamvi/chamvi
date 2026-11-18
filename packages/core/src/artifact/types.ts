/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolResultPart } from 'ai';
import type { Artifact, IArtifactRepository } from '@chamvi/store';

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

/**
 * The artifacts of one run, part of the tool context. Not an effect by
 * itself: put `put()` inside a `defineEffectTool` to store a file exactly once.
 */
/**
 * The file item of a tool's `toModelOutput` content for an artifact
 * (`artifactFilePart()`): its data is the artifact's marker, which the
 * engine swaps for the bytes before each model call.
 */
export type ArtifactFilePart = Extract<
    Extract<ToolResultPart['output'], { type: 'content' }>['value'][number],
    { type: 'file' }
>;

export interface IRunArtifacts {
    /**
     * Stores a file as an artifact of the run (with `key`: replacing an artifact
     * stored with that key before and keeping its id).
     * Throws ValidationError for an invalid input.
     */
    put(input: ArtifactInput): Promise<Artifact>;
    /** An artifact of this run with its bytes; undefined for an unknown id or another run's artifact. */
    get(id: string): Promise<{ artifact: Artifact; data: Uint8Array } | undefined>;
    /** The run's artifacts, by createdAt then id. */
    list(): Promise<Artifact[]>;
}

export type ArtifactServiceContext = {
    repository: IArtifactRepository;
};

/**
 * The operations of `ArtifactService`. Anything that satisfies it can stand in
 * for the service: the engine, the channels and the HTTP API take this type.
 */
export interface IArtifactService {
    /**
     * Insert-if-absent: resolves false and keeps the stored artifact
     * (metadata and bytes) when an artifact with that id, or with `key` in
     * that run, exists.
     */
    create(artifact: Artifact, data: Uint8Array, key?: string): Promise<boolean>;

    /**
     * Upsert by `(runId, key)`: an absent key inserts the artifact as
     * given; an existing one keeps its `id`, `agent` and `createdAt`,
     * replaces `mediaType`, `filename` (removed when absent), `size` and the
     * bytes. Resolves the stored metadata.
     */
    save(artifact: Artifact, data: Uint8Array, key: string): Promise<Artifact>;

    /** Metadata only. */
    findOne(id: string): Promise<Artifact | undefined>;

    /** As `findOne`; ArtifactNotFoundError when absent. */
    findOneOrFail(id: string): Promise<Artifact>;

    /** Metadata of the run's artifact stored under `key`. */
    findOneByKey(runId: string, key: string): Promise<Artifact | undefined>;

    /** The bytes, as a plain Uint8Array (no Buffer or other subclass). */
    read(id: string): Promise<Uint8Array | undefined>;

    /** Metadata of a run's artifacts, ordered by createdAt ascending, ties broken by id ascending. */
    find(runId: string): Promise<Artifact[]>;

    /** As `find`; RepositoryNotFoundError when the run has no artifact. */
    findOrFail(runId: string): Promise<Artifact[]>;
}
