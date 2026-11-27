/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Artifact } from '@chamvi/core-kit';
import type { APIRequestOptions, Wire } from '../types.ts';

/** `GET /runs/:id/artifacts`: an artifact's metadata, never its bytes. */
export type ArtifactWire = Wire<Artifact>;

export interface IArtifactAPI {
    getMany(runId: string, options?: APIRequestOptions): Promise<ArtifactWire[]>;
    /** `GET /runs/:id/artifacts/:artifactId`: an artifact's bytes, typed by the stored media type. */
    read(runId: string, artifactId: string, options?: APIRequestOptions): Promise<Blob>;
}
