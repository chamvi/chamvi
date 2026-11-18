/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Checkpoint, ICheckpointRepository  } from '@chamvi/store';

export type CheckpointServiceContext = {
    repository: ICheckpointRepository;
};

/**
 * The operations of `CheckpointService`. Anything that satisfies it can stand in
 * for the service: the engine, the channels and the HTTP API take this type.
 */
export interface ICheckpointService {
    /**
     * Keeps `checkpoint` unless the run holds one with a higher
     * `stepIndex`; resolves the checkpoint the run holds afterwards. A run
     * the store does not hold is RunNotFoundError and nothing is written.
     */
    save(checkpoint: Checkpoint): Promise<Checkpoint>;

    findOne(runId: string): Promise<Checkpoint | undefined>;

    /** As `findOne`; RepositoryNotFoundError when the run holds no checkpoint. */
    findOneOrFail(runId: string): Promise<Checkpoint>;
}
