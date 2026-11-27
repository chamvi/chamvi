/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ArtifactRecord } from '@chamvi/core-kit';
import type { IEntityRepository } from '../entity/types.ts';

/**
 * The artifact port: the generic entity port on `ArtifactRecord` (key
 * `id`, `(runId, key)` unique, no reference to the run: attachments are
 * stored before their run). Reads return the metadata only: `key` and
 * `data` are written by `save`/`upsert` and never returned; a where may
 * name `key`. The bytes are read with `readData`.
 */
export interface IArtifactRepository extends IEntityRepository<ArtifactRecord> {
    /** The bytes of the artifact with this id, as a plain `Uint8Array`, or `null`. Locks nothing. */
    readData(id: string): Promise<Uint8Array | null>;
}
