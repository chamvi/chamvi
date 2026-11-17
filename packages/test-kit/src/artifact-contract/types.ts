/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IArtifactRepository } from '@chamvi/store';

export type ArtifactRepositoryContractInput = {
    /** Label of the suite, e.g. the driver. */
    name: string;
    /** A fresh, empty artifact repository per test. */
    create(): Promise<IArtifactRepository>;
};
