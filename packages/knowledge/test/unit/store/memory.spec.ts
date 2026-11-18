/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { KnowledgeService, createMemoryKnowledgeRepository } from '@chamvi/knowledge';
import { ControllableClock, describeKnowledgeRepositoryContract } from '@chamvi/test-kit';

describeKnowledgeRepositoryContract({
    name: 'memory',
    create: () => new KnowledgeService({
        repository: createMemoryKnowledgeRepository(),
        clock: new ControllableClock(new Date('2026-11-01T00:00:00Z')),
    }),
});
