/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ArtifactNotFoundError, RepositoryNotFoundError, RunNotFoundError } from '@chamvi/core';
import type { Artifact, IArtifactRepository } from '@chamvi/core';
import type { DataSource, Repository } from 'typeorm';
import { ArtifactEntity } from '../entities/index.ts';
import {
    isUuid,
    toArtifact,
    toArtifactValues,
    toEntity,
} from '../repository/helpers.ts';

export class DatabaseArtifactRepository implements IArtifactRepository {
    protected dataSource: DataSource;

    constructor(opts: { dataSource: DataSource }) {
        this.dataSource = opts.dataSource;
    }

    protected get artifacts(): Repository<ArtifactEntity> {
        return this.dataSource.getRepository(ArtifactEntity);
    }

    async insert(artifact: Artifact, data: Uint8Array, key?: string): Promise<boolean> {
        if (!isUuid(artifact.runId)) {
            throw new RunNotFoundError(artifact.runId);
        }

        // no conflict target: a taken id and a taken (run_id, key) both keep the stored artifact
        const result = await this.artifacts.createQueryBuilder()
            .insert()
            .values(toArtifactValues(artifact, data, key))
            .orIgnore()
            .returning(['id'])
            .updateEntity(false)
            .execute();

        return result.raw.length === 1;
    }

    async save(artifact: Artifact, data: Uint8Array, key: string): Promise<Artifact> {
        if (!isUuid(artifact.runId)) {
            throw new RunNotFoundError(artifact.runId);
        }

        // one statement: insert, or replace the row of this (run_id, key); the stored id, agent and created_at stay
        const result = await this.artifacts.createQueryBuilder()
            .insert()
            .values(toArtifactValues(artifact, data, key))
            .orUpdate(['media_type', 'filename', 'size', 'data'], ['run_id', 'key'])
            .returning(['id', 'runId', 'agent', 'mediaType', 'filename', 'size', 'createdAt'])
            .updateEntity(false)
            .execute();

        return toArtifact(toEntity(this.dataSource, ArtifactEntity, result.raw[0]));
    }

    async findOne(id: string): Promise<Artifact | undefined> {
        if (!isUuid(id)) {
            return undefined;
        }

        // the data column is select: false, so the bytes stay in the database
        const entity = await this.artifacts.findOneBy({ id });

        return entity ? toArtifact(entity) : undefined;
    }

    async findOneOrFail(id: string): Promise<Artifact> {
        const result = await this.findOne(id);

        if (result === undefined) {
            throw new ArtifactNotFoundError(id);
        }

        return result;
    }

    async findOneByKey(runId: string, key: string): Promise<Artifact | undefined> {
        if (!isUuid(runId)) {
            return undefined;
        }

        const entity = await this.artifacts.findOneBy({ runId, key });

        return entity ? toArtifact(entity) : undefined;
    }

    async read(id: string): Promise<Uint8Array | undefined> {
        if (!isUuid(id)) {
            return undefined;
        }

        const entity = await this.artifacts.findOne({
            select: { id: true, data: true },
            where: { id },
        });

        // a copy into a plain Uint8Array: a Buffer would leak its toJSON
        return entity ? new Uint8Array(entity.data) : undefined;
    }

    async find(runId: string): Promise<Artifact[]> {
        if (!isUuid(runId)) {
            return [];
        }

        const entities = await this.artifacts.find({
            where: { runId },
            order: { createdAt: 'ASC', id: 'ASC' },
        });

        return entities.map((entity) => toArtifact(entity));
    }

    async findOrFail(runId: string): Promise<Artifact[]> {
        const result = await this.find(runId);

        if (result.length === 0) {
            throw new RepositoryNotFoundError('artifacts');
        }

        return result;
    }
}
