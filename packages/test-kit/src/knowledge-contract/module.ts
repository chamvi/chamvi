/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe } from 'vitest';
import { describeKnowledgeChunksContract } from './chunks.ts';
import { describeKnowledgeCollectionsContract } from './collections.ts';
import { describeKnowledgeDocumentsContract } from './documents.ts';
import { describeKnowledgeFenceContract } from './fence.ts';
import { describeKnowledgeSearchContract } from './search.ts';
import type { KnowledgeRepositoryContractOptions } from './types.ts';

/**
 * Shared behavioural contract for every knowledge backend: it drives
 * `@chamvi/knowledge`'s `KnowledgeService` over the backend's
 * repositories, so the service's rules and the repositories' storage are
 * checked together.
 *
 * @param options.name    Label of the suite, e.g. the backend.
 * @param options.create  Factory for a service over fresh, empty repositories per test.
 */
export function describeKnowledgeRepositoryContract(options: KnowledgeRepositoryContractOptions): void {
    const { name, create } = options;

    describe(`knowledge repository contract: ${name}`, () => {
        describeKnowledgeCollectionsContract(create);
        describeKnowledgeDocumentsContract(create);
        describeKnowledgeChunksContract(create);
        describeKnowledgeSearchContract(create);
        describeKnowledgeFenceContract(create);
    });
}
