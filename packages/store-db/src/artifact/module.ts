/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ArtifactNotFoundError, InvalidRunStateError, RepositoryNotFoundError } from '@chamvi/core';
import type { Artifact, IArtifactRepository } from '@chamvi/core';
import type { DataSource, Repository } from 'typeorm';
import { ArtifactEntity } from '../entities/index.ts';
import { toArtifact, toArtifactValues, toEntity } from '../repository/helpers.ts';

export class DatabaseArtifactRepository implements IArtifactRepository {
    protected dataSource: DataSource;

    constructor(opts: { dataSource: DataSource }) {
        this.dataSource = opts.dataSource;
    }

    protected get artifacts(): Repository<ArtifactEntity> {
        return this.dataSource.getRepository(ArtifactEntity);
    }

    async insert(artifact: Artifact, data: Uint8Array): Promise<boolean> {
        const result = await this.artifacts.createQueryBuilder()
            .insert()
            .values(toArtifactValues(artifact, data))
            .orIgnore()
            .returning(['id'])
            .updateEntity(false)
            .execute();

        return result.raw.length === 1;
    }

    async save(artifact: Artifact, data: Uint8Array): Promise<Artifact> {
        // one statement: insert, or replace the row when it belongs to the same run
        // (the overwrite condition), so an id of another run updates nothing
        const result = await this.artifacts.createQueryBuilder()
            .insert()
            .values(toArtifactValues(artifact, data))
            .orUpdate(
                ['media_type', 'filename', 'size', 'data'],
                ['id'],
                { overwriteCondition: { where: { runId: artifact.runId } } },
            )
            .returning(['id', 'runId', 'agent', 'mediaType', 'filename', 'size', 'createdAt'])
            .updateEntity(false)
            .execute();
        const [row] = result.raw as Record<string, unknown>[];

        if (row === undefined) {
            throw new InvalidRunStateError(`The artifact id "${artifact.id}" belongs to another run.`);
        }

        return toArtifact(toEntity(this.dataSource, ArtifactEntity, row));
    }

    async findOne(id: string): Promise<Artifact | undefined> {
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

    async read(id: string): Promise<Uint8Array | undefined> {
        const entity = await this.artifacts.findOne({
            select: { id: true, data: true },
            where: { id },
        });

        // a copy into a plain Uint8Array: a Buffer would leak its toJSON
        return entity ? new Uint8Array(entity.data) : undefined;
    }

    async find(runId: string): Promise<Artifact[]> {
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
