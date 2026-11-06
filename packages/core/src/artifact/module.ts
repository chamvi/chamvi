/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { UUID, uuidv7 } from 'uuidv7';
import type { IClock } from '../clock/index.ts';
import { InvalidRunStateError, ValidationError } from '../errors/index.ts';
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
 * (default a random UUID v7). The store's insert-if-absent decides a race: when
 * an artifact of this run already holds `id`, that stored artifact is
 * returned, so the caller never names metadata the store does not hold.
 */
export async function storeArtifact(
    store: IArtifactRepository,
    run: { id: string; agent: string },
    input: ArtifactInput,
    createdAt: Date,
    id: string = uuidv7(),
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
 * Stable attachment ids ordered by position for replay and healing.
 */
export function attachmentIds(runId: string, count: number): string[] {
    return Array.from({ length: count }, (_, i) => deterministicArtifactId(runId, undefined, i));
}

/**
 * Stable artifact id derived from the run and key, separately namespaced from attachments.
 */
export function keyedArtifactId(runId: string, key: string): string {
    return deterministicArtifactId(runId, key);
}

function deterministicArtifactId(runId: string, key?: string, index = 0): string {
    let parsed: UUID;

    try {
        parsed = UUID.parse(runId);
    } catch {
        throw new ValidationError('The artifact run id must be a UUID.');
    }

    const digest = createHash('sha256').update(JSON.stringify([runId, key === undefined ? 'attachment' : 'key', key])).digest('hex');
    // Leave room for every array index so ordered attachment ids cannot wrap.
    const range = key === undefined ? (1n << 74n) - (1n << 32n) : 1n << 74n;
    const entropy = BigInt(`0x${digest}`) % range + BigInt(index);

    return UUID.fromFieldsV7(
        Number.parseInt(parsed.toHex().slice(0, 12), 16),
        Number(entropy >> 62n),
        Number((entropy >> 32n) & 0x3fffffffn),
        Number(entropy & 0xffffffffn),
    ).toString();
}

/** The artifacts of one run, as tools get them. */
export function createRunArtifacts(
    store: IArtifactRepository,
    run: { id: string; agent: string },
    clock: IClock,
): IRunArtifacts {
    return createGuardedRunArtifacts(store, run, clock, () => {});
}

/**
 * createRunArtifacts() with `assertWritable` called with the writer's name
 * before every put (an execution's ToolContext); a throw refuses it and
 * nothing is stored. Reads are never checked.
 */
export function createGuardedRunArtifacts(
    store: IArtifactRepository,
    run: { id: string; agent: string },
    clock: IClock,
    assertWritable: (name: string) => void,
): IRunArtifacts {
    return {
        async put(input) {
            assertWritable('artifacts.put()');
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
