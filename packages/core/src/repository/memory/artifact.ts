/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ArtifactNotFoundError, RepositoryNotFoundError } from '../../errors/index.ts';
import type { Artifact } from '../../artifact/types.ts';
import type { IArtifactRepository } from '../types.ts';
import { copy } from './helpers.ts';

export class MemoryArtifactRepository implements IArtifactRepository {
    protected artifacts = new Map<string, {
        artifact: Artifact;
        data: Uint8Array;
        key?: string;
    }>();

    /** Artifact id by `(runId, key)`, so keyed writes stay direct lookups. */
    protected keyed = new Map<string, string>();

    async insert(artifact: Artifact, data: Uint8Array, key?: string): Promise<boolean> {
        if (this.artifacts.has(artifact.id) || (key !== undefined && this.findEntryByKey(artifact.runId, key))) {
            return false;
        }

        this.artifacts.set(artifact.id, {
            artifact: copy(artifact),
            data: new Uint8Array(data),
            key,
        });

        if (key !== undefined) {
            this.keyed.set(this.keyOf(artifact.runId, key), artifact.id);
        }

        return true;
    }

    async save(artifact: Artifact, data: Uint8Array, key: string): Promise<Artifact> {
        const entry = this.findEntryByKey(artifact.runId, key);
        const next = copy(artifact);

        if (next.filename === undefined) {
            delete next.filename;
        }

        if (entry) {
            next.id = entry.artifact.id;
            next.agent = entry.artifact.agent;
            next.createdAt = entry.artifact.createdAt;
        }

        this.artifacts.set(next.id, {
            artifact: next,
            data: new Uint8Array(data),
            key,
        });
        this.keyed.set(this.keyOf(artifact.runId, key), next.id);

        return copy(next);
    }

    async findOneOrFail(id: string): Promise<Artifact> {
        const result = await this.findOne(id);

        if (result === undefined) {
            throw new ArtifactNotFoundError(id);
        }

        return result;
    }

    async findOrFail(runId: string): Promise<Artifact[]> {
        const result = await this.find(runId);

        if (result.length === 0) {
            throw new RepositoryNotFoundError('artifacts');
        }

        return result;
    }

    async findOne(id: string): Promise<Artifact | undefined> {
        const entry = this.artifacts.get(id);

        return entry ? copy(entry.artifact) : undefined;
    }

    async findOneByKey(runId: string, key: string): Promise<Artifact | undefined> {
        const entry = this.findEntryByKey(runId, key);

        return entry ? copy(entry.artifact) : undefined;
    }

    async read(id: string): Promise<Uint8Array | undefined> {
        const entry = this.artifacts.get(id);

        return entry ? new Uint8Array(entry.data) : undefined;
    }

    async find(runId: string): Promise<Artifact[]> {
        return this.artifacts.values().toArray()
            .map((entry) => entry.artifact)
            .filter((artifact) => artifact.runId === runId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id, 'en'))
            .map((artifact) => copy(artifact));
    }

    protected findEntryByKey(runId: string, key: string) {
        const id = this.keyed.get(this.keyOf(runId, key));

        return id === undefined ? undefined : this.artifacts.get(id);
    }

    protected keyOf(runId: string, key: string): string {
        return JSON.stringify([runId, key]);
    }
}
