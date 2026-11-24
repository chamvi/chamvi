/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as store from '@chamvi/store-memory';

describe('public api', () => {
    it('exports exactly the registry, the repository base and the aggregate repositories', () => {
        expect(Object.keys(store).sort()).toEqual([
            'MemoryAgentRevisionRepository',
            'MemoryArtifactRepository',
            'MemoryCheckpointRepository',
            'MemoryConnectionEntryRepository',
            'MemoryConnectionRepository',
            'MemoryConnectionSecretRepository',
            'MemoryConversationItemRepository',
            'MemoryConversationNoteRepository',
            'MemoryConversationOperationRepository',
            'MemoryConversationRepository',
            'MemoryEffectRepository',
            'MemoryEntityRepository',
            'MemoryIdempotencyRepository',
            'MemoryLimitRepository',
            'MemoryLockRepository',
            'MemoryRegistry',
            'MemoryRunRepository',
            'MemoryStateDocumentRepository',
            'MemoryStateRepository',
            'MemoryStepRepository',
        ]);
    });
});
