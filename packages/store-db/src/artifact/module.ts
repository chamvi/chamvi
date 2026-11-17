/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource, DeepPartial, EntityManager } from 'typeorm';
import { EntityRelationError } from '@chamvi/store';
import type { ArtifactRecord, IArtifactRepository } from '@chamvi/store';
import { ArtifactEntity } from '../entities/index.ts';
import { EntityRepositoryAdapter } from '../entity/module.ts';
import { isUuidValue } from '../entity/helpers/index.ts';

/**
 * The columns of a (partial) artifact: an absent property maps to absent
 * columns; the bytes are copied into a Buffer, the bytea parameter the
 * driver expects.
 */
function toArtifactEntity(value: Partial<ArtifactRecord>): DeepPartial<ArtifactEntity> {
    return {
        id: value.id,
        key: value.key,
        runId: value.runId,
        agent: value.agent,
        mediaType: value.mediaType,
        filename: value.filename,
        size: value.size,
        data: value.data === undefined ? undefined : Buffer.from(value.data),
        createdAt: value.createdAt,
    } as DeepPartial<ArtifactEntity>;
}

/** The metadata of a row: a NULL filename is absent, the key and the bytes are never returned. */
function fromArtifactEntity(entity: ArtifactEntity): ArtifactRecord {
    const artifact: ArtifactRecord = {
        id: entity.id,
        runId: entity.runId,
        agent: entity.agent,
        mediaType: entity.mediaType,
        size: entity.size,
        createdAt: entity.createdAt,
    };

    if (entity.filename !== null && entity.filename !== undefined) {
        artifact.filename = entity.filename;
    }

    return artifact;
}

/**
 * Artifacts in `chamvi_artifacts`: `key` and `data` are never selected by
 * a read (`select: false`), `readData` loads the bytes. `run_id` has no
 * foreign key (attachments are stored before their run), so a `runId`
 * that is no uuid, which the column cannot hold, is refused as a missing
 * run (`EntityRelationError` naming `run`) before it reaches the database.
 */
export class DatabaseArtifactRepository extends EntityRepositoryAdapter<ArtifactRecord, ArtifactEntity> implements IArtifactRepository {
    constructor(source: DataSource | EntityManager) {
        super(source.getRepository(ArtifactEntity), {
            entity: 'artifact',
            alias: 'artifact',
            target: ArtifactEntity,
            toEntity: toArtifactEntity,
            fromEntity: fromArtifactEntity,
        });
    }

    withManager(manager: EntityManager): this {
        return new DatabaseArtifactRepository(manager) as this;
    }

    override async save(entity: ArtifactRecord): Promise<ArtifactRecord> {
        this.assertRunId(entity);

        return super.save(entity);
    }

    override async upsert(entity: ArtifactRecord): Promise<ArtifactRecord> {
        this.assertRunId(entity);

        return super.upsert(entity);
    }

    override async upsertMany(entities: ArtifactRecord[]): Promise<ArtifactRecord[]> {
        for (const entity of entities) {
            this.assertRunId(entity);
        }

        return super.upsertMany(entities);
    }

    async readData(id: string): Promise<Uint8Array | null> {
        if (this.mustQueue()) {
            return this.transaction((repository) => repository.readData(id));
        }

        this.assertOpen('readData');

        if (!isUuidValue(id)) {
            return null;
        }

        const row = await this.persist(() => this.repository.findOne({
            select: { id: true, data: true },
            where: { id },
        }), 'readData');

        // a copy into a plain Uint8Array: a Buffer would leak its toJSON
        return row ? new Uint8Array(row.data) : null;
    }

    protected assertRunId(entity: ArtifactRecord): void {
        if (entity.runId !== undefined && !isUuidValue(entity.runId)) {
            throw new EntityRelationError(this.options.entity, 'run');
        }
    }
}
