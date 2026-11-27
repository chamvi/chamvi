/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineQuery, eq } from '@rapiq/core';
import { EntityConflictError, EntityRelationError } from '@chamvi/store';
import type { IArtifactRepository } from '@chamvi/store';
import type { Artifact } from '@chamvi/core-kit';
import { ArtifactNotFoundError, RepositoryNotFoundError, RunNotFoundError } from '../errors/index.ts';
import { readArtifact } from './helpers.ts';
import type { ArtifactServiceContext, IArtifactService } from './types.ts';

/**
 * The files of runs over an `IArtifactRepository`: metadata and bytes,
 * both copied in and out. An artifact is inserted if absent (by id, and by
 * `key` within its run); a keyed save replaces the bytes and metadata of
 * that key and keeps the stored `id`, `agent` and `createdAt`. The key is
 * private: no read returns it.
 */
export class ArtifactService implements IArtifactService {
    protected repository: IArtifactRepository;

    constructor(ctx: ArtifactServiceContext) {
        this.repository = ctx.repository;
    }

    async create(artifact: Artifact, data: Uint8Array, key?: string): Promise<boolean> {
        try {
            await this.transaction(artifact.runId, (repository) => repository.save(repository.create({
                ...artifact,
                ...(key === undefined ? {} : { key }),
                data: new Uint8Array(data),
            })));
        } catch (error) {
            // the failed transaction rolled back; the stored artifact stays as it is
            if (error instanceof EntityConflictError) {
                return false;
            }

            throw error;
        }

        return true;
    }

    async save(artifact: Artifact, data: Uint8Array, key: string): Promise<Artifact> {
        try {
            return await this.write(artifact, data, key);
        } catch (error) {
            // two first saves of one key raced and this insert lost: the row exists now
            if (error instanceof EntityConflictError) {
                return this.write(artifact, data, key);
            }

            throw error;
        }
    }

    async findOne(id: string): Promise<Artifact | undefined> {
        const record = await this.repository.findOneById(id);

        return record ? readArtifact(record) : undefined;
    }

    async findOneOrFail(id: string): Promise<Artifact> {
        const artifact = await this.findOne(id);

        if (!artifact) {
            throw new ArtifactNotFoundError(id);
        }

        return artifact;
    }

    async findOneByKey(runId: string, key: string): Promise<Artifact | undefined> {
        const record = await this.repository.findOneBy({ runId, key });

        return record ? readArtifact(record) : undefined;
    }

    async read(id: string): Promise<Uint8Array | undefined> {
        return (await this.repository.readData(id)) ?? undefined;
    }

    async find(runId: string): Promise<Artifact[]> {
        const { data } = await this.repository.findMany(defineQuery({
            filters: eq('runId', runId),
            sorts: { createdAt: 'ASC', id: 'ASC' },
        }));

        return data.map((record) => readArtifact(record));
    }

    async findOrFail(runId: string): Promise<Artifact[]> {
        const artifacts = await this.find(runId);

        if (artifacts.length === 0) {
            throw new RepositoryNotFoundError('artifacts');
        }

        return artifacts;
    }

    protected async write(artifact: Artifact, data: Uint8Array, key: string): Promise<Artifact> {
        return this.transaction(artifact.runId, async (repository) => {
            const stored = await repository.findOneBy({ runId: artifact.runId, key });

            if (!stored) {
                return readArtifact(await repository.save(repository.create({
                    ...artifact,
                    key,
                    data: new Uint8Array(data),
                })));
            }

            // the stored id, agent and createdAt stay
            repository.merge(stored, {
                mediaType: artifact.mediaType,
                filename: artifact.filename,
                size: artifact.size,
                data: new Uint8Array(data),
            });

            return readArtifact(await repository.save(stored));
        });
    }

    /** A transaction on the repository; a run the repository cannot reference is RunNotFoundError. */
    protected async transaction<R>(runId: string, fn: (repository: IArtifactRepository) => Promise<R>): Promise<R> {
        try {
            return await this.repository.transaction(fn);
        } catch (error) {
            if (error instanceof EntityRelationError && error.relation === 'run') {
                throw new RunNotFoundError(runId);
            }

            throw error;
        }
    }
}
