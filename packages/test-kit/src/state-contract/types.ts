/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IStateDocumentRepository, IStateRepository } from '@chamvi/store';

export type StateRepositoryContractInput = {
    /** Label of the suite, e.g. the driver. */
    name: string;
    /** Fresh, empty state repositories (keys and documents) per test. */
    create(): Promise<{ entries: IStateRepository; documents: IStateDocumentRepository }>;
};
