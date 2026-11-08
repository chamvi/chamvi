/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { uuidv7 } from 'uuidv7';
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

/** The metadata of `input` as a new artifact of the run, under a fresh UUID v7. */
function createArtifact(
    run: { id: string; agent: string },
    input: ArtifactInput,
    createdAt: Date,
): Artifact {
    return {
        id: uuidv7(),
        runId: run.id,
        agent: run.agent,
        mediaType: input.mediaType,
        ...(input.filename === undefined ? {} : { filename: input.filename }),
        size: input.data.byteLength,
        createdAt,
    };
}

/**
 * Stores `input` (validated already) as an artifact of the run, optionally
 * under a private `key`. The store's insert-if-absent decides a race: when
 * the run already holds `key`, that stored artifact is returned, so the
 * caller never names metadata the store does not hold.
 */
export async function storeArtifact(
    store: IArtifactRepository,
    run: { id: string; agent: string },
    input: ArtifactInput,
    createdAt: Date,
    key?: string,
): Promise<Artifact> {
    const artifact = createArtifact(run, input, createdAt);

    if (await store.insert(artifact, input.data, key)) {
        return artifact;
    }

    const stored = key === undefined ? undefined : await store.findOneByKey(run.id, key);

    if (!stored) {
        throw new InvalidRunStateError(`The artifact "${artifact.id}" could not be stored for run "${run.id}".`);
    }

    return stored;
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

            return store.save(createArtifact(run, input, clock.now()), input.data, `tool:${input.key}`);
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
