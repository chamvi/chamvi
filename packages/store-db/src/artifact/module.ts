/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { ArtifactNotFoundError, InvalidRunStateError, RepositoryNotFoundError } from '@chamvi/core';
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
        const result = await this.artifacts.createQueryBuilder()
            .insert()
            .values(toArtifactValues(artifact, data, key))
            .orIgnore()
            .returning(['id'])
            .updateEntity(false)
            .execute();

        return result.raw.length === 1;
    }

    async save(artifact: Artifact, data: Uint8Array, key?: string): Promise<Artifact> {
        try {
            const result = await this.artifacts.createQueryBuilder()
                .insert()
                .values(toArtifactValues(artifact, data, key))
                .orUpdate(
                    ['media_type', 'filename', 'size', 'data'],
                    key === undefined ? ['id'] : ['run_id', 'key'],
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
        } catch (error) {
            const { metadata } = this.artifacts;
            const primary = this.dataSource.namingStrategy.primaryKeyName(
                metadata.tablePath,
                metadata.primaryColumns.map((column) => column.databaseName),
            );

            if (isObject(error) && isObject(error.driverError) && error.driverError.code === '23505' && error.driverError.constraint === primary) {
                throw new InvalidRunStateError(`The artifact id "${artifact.id}" is already in use.`);
            }

            throw error;
        }
    }

    async findOne(id: string): Promise<Artifact | undefined> {
        if (!isUuid(id)) {
            return undefined;
        }

        // the data column is select: false, so the bytes stay in the database
        const entity = await this.artifacts.findOneBy({ id });

        return entity ? toArtifact(entity) : undefined;
    }

    async findOneByKey(runId: string, key: string): Promise<Artifact | undefined> {
        if (!isUuid(runId) || typeof key !== 'string' || !key.isWellFormed() || key.includes('\0')) {
            return undefined;
        }

        const entity = await this.artifacts.findOneBy({ runId, key });

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
