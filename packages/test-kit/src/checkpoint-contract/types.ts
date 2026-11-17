/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ICheckpointRepository, IRunRepository } from '@chamvi/store';

export type CheckpointRepositoryContractInput = {
    /** Label of the suite, e.g. the driver. */
    name: string;
    /** Fresh, empty repositories per test, on one shared store: checkpoints reference runs. */
    create(): Promise<{ runs: IRunRepository; checkpoints: ICheckpointRepository }>;
};
