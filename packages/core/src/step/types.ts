/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IStepRepository, Step  } from '@chamvi/store';

export type StepServiceContext = {
    repository: IStepRepository;
};

/**
 * The operations of `StepService`. Anything that satisfies it can stand in
 * for the service: the engine, the channels and the HTTP API take this type.
 */
export interface IStepService {
    /** Appends the step; a run the store does not hold is RunNotFoundError and nothing is written. */
    create(step: Step): Promise<void>;

    find(runId: string): Promise<Step[]>;

    /** As `find`; RepositoryNotFoundError when the run has no step. */
    findOrFail(runId: string): Promise<Step[]>;
}
