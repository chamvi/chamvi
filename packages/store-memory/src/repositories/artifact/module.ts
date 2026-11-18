/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ArtifactRecord, EntityRecord, IArtifactRepository } from '@chamvi/store';
import { MemoryEntityRepository } from '../../entity/module.ts';
import type { MemoryRepositoryOptions } from '../../entity/types.ts';

/**
 * Artifacts in the registry (entity `artifact`, key `id`, `(runId, key)`
 * unique, no reference: attachments are stored before their run). The
 * row holds the private `key` and the bytes; reads return the metadata.
 */
export class MemoryArtifactRepository extends MemoryEntityRepository<ArtifactRecord> implements IArtifactRepository {
    constructor(options: MemoryRepositoryOptions) {
        super({
            entity: 'artifact',
            registry: options.registry,
            key: ['id'],
            unique: [['runId', 'key']],
        });
    }

    async readData(id: string): Promise<Uint8Array | null> {
        this.assertOpen();

        const row = this.registry.read(this.entity, this.registry.keyOf(this.entity, { id }), this.tx);

        // a copy into a plain Uint8Array
        return row?.data instanceof Uint8Array ? new Uint8Array(row.data) : null;
    }

    protected override toEntity(row: EntityRecord): ArtifactRecord {
        const artifact = { ...row };

        delete artifact.key;
        delete artifact.data;

        return super.toEntity(artifact);
    }
}
