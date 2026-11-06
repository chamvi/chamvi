/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ArtifactNotFoundError, InvalidRunStateError, RepositoryNotFoundError } from '../../errors/index.ts';
import type { Artifact } from '../../artifact/types.ts';
import type { IArtifactRepository } from '../types.ts';
import { copy } from './helpers.ts';

export class MemoryArtifactRepository implements IArtifactRepository {
    protected artifacts = new Map<string, { artifact: Artifact; data: Uint8Array }>();

    protected keys = new Map<string, Map<string, string>>();

    async insert(artifact: Artifact, data: Uint8Array, key?: string): Promise<boolean> {
        if (this.artifacts.has(artifact.id) || (key !== undefined && this.keys.get(artifact.runId)?.has(key))) {
            return false;
        }

        this.artifacts.set(artifact.id, { artifact: copy(artifact), data: new Uint8Array(data) });

        if (key !== undefined) {
            const keys = this.keys.get(artifact.runId) ?? new Map<string, string>();

            keys.set(key, artifact.id);
            this.keys.set(artifact.runId, keys);
        }

        return true;
    }

    async save(artifact: Artifact, data: Uint8Array, key?: string): Promise<Artifact> {
        if (key !== undefined && !this.keys.get(artifact.runId)?.has(key) && this.artifacts.has(artifact.id)) {
            throw new InvalidRunStateError(`The artifact id "${artifact.id}" cannot be assigned another key.`);
        }

        const id = key === undefined ? artifact.id : this.keys.get(artifact.runId)?.get(key) ?? artifact.id;
        const entry = this.artifacts.get(id);

        if (entry && entry.artifact.runId !== artifact.runId) {
            throw new InvalidRunStateError(`The artifact id "${artifact.id}" belongs to another run.`);
        }

        const next = copy(artifact);

        if (next.filename === undefined) {
            delete next.filename;
        }

        if (entry) {
            next.id = entry.artifact.id;
            next.agent = entry.artifact.agent;
            next.createdAt = entry.artifact.createdAt;
        }

        this.artifacts.set(id, { artifact: next, data: new Uint8Array(data) });

        if (key !== undefined) {
            const keys = this.keys.get(artifact.runId) ?? new Map<string, string>();

            keys.set(key, id);
            this.keys.set(artifact.runId, keys);
        }

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

    async findOneByKey(runId: string, key: string): Promise<Artifact | undefined> {
        const id = this.keys.get(runId)?.get(key);

        return id === undefined ? undefined : this.findOne(id);
    }

    async findOne(id: string): Promise<Artifact | undefined> {
        const entry = this.artifacts.get(id);

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
}
