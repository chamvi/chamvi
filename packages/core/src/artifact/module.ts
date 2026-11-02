/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { IClock } from '../clock/index.ts';
import { InvalidRunStateError } from '../errors/index.ts';
import type { IArtifactRepository } from '../repository/types.ts';
import { ARTIFACT_URI_PREFIX } from './constants.ts';
import { assertArtifactInput } from './helpers.ts';
import type {
    Artifact,
    ArtifactFilePart,
    ArtifactInput,
    IRunArtifacts,
} from './types.ts';

/**
 * Stores `input` (validated already) as an artifact of the run under `id`
 * (default a random UUID). The store's insert-if-absent decides a race: when
 * an artifact of this run already holds `id`, that stored artifact is
 * returned, so the caller never names metadata the store does not hold.
 */
export async function storeArtifact(
    store: IArtifactRepository,
    run: { id: string; agent: string },
    input: ArtifactInput,
    createdAt: Date,
    id: string = randomUUID(),
): Promise<Artifact> {
    const artifact: Artifact = {
        id,
        runId: run.id,
        agent: run.agent,
        mediaType: input.mediaType,
        ...(input.filename === undefined ? {} : { filename: input.filename }),
        size: input.data.byteLength,
        createdAt,
    };

    if (await store.insert(artifact, input.data)) {
        return artifact;
    }

    const stored = await store.findOne(id);

    if (stored?.runId !== run.id) {
        throw new InvalidRunStateError(`The artifact id "${id}" belongs to another run.`);
    }

    return stored;
}

/**
 * The ids of a dispatch's attachments: `<runId>.<index>`, the index
 * zero-padded to one width for the whole dispatch (at least 4 digits), so
 * the listing order (createdAt, then id) is the input order and a
 * concurrent healer of the same run writes to the same ids.
 */
export function attachmentIds(runId: string, count: number): string[] {
    const width = Math.max(4, String(Math.max(count - 1, 0)).length);

    return Array.from({ length: count }, (_, i) => `${runId}.${String(i).padStart(width, '0')}`);
}

/**
 * The id of a run's artifact stored under `key` (`artifacts.put({ key })`):
 * `<runId>.k.<the first 32 hex digits of sha256(key)>`. It never matches an
 * attachment id (`<runId>.<digits>`) and fits the stores' id width.
 */
export function keyedArtifactId(runId: string, key: string): string {
    return `${runId}.k.${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
}

/** The artifacts of one run, as tools get them. */
export function createRunArtifacts(
    store: IArtifactRepository,
    run: { id: string; agent: string },
    clock: IClock,
): IRunArtifacts {
    return {
        async put(input) {
            assertArtifactInput(input);

            if (input.key === undefined) {
                return storeArtifact(store, run, input, clock.now());
            }

            return store.save({
                id: keyedArtifactId(run.id, input.key),
                runId: run.id,
                agent: run.agent,
                mediaType: input.mediaType,
                ...(input.filename === undefined ? {} : { filename: input.filename }),
                size: input.data.byteLength,
                createdAt: clock.now(),
            }, input.data);
        },
        async get(id) {
            const artifact = await store.findOne(id);

            if (artifact?.runId !== run.id) {
                return undefined;
            }

            const data = await store.read(id);

            if (!data) {
                return undefined;
            }

            return { artifact, data };
        },
        list() {
            return store.find(run.id);
        },
    };
}

/**
 * The file item a tool's `toModelOutput` returns for an artifact (e.g. one
 * it stored with `context.artifacts.put()`): the data is the artifact's
 * marker, so the tool step and every checkpoint keep the id only, and the
 * engine hands the model the bytes before each model call (also after a
 * resume). The artifact must belong to the run.
 */
export function artifactFilePart(artifact: Pick<Artifact, 'id' | 'mediaType' | 'filename'>): ArtifactFilePart {
    return {
        type: 'file',
        mediaType: artifact.mediaType,
        ...(artifact.filename === undefined ? {} : { filename: artifact.filename }),
        data: { type: 'data', data: `${ARTIFACT_URI_PREFIX}${artifact.id}` },
    };
}
