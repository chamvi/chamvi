/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { MemoryConversationRepository } from '../../conversation/memory.ts';
import type { IConversationRepository } from '../../conversation/types.ts';
import type { IConnectionRepository, IStore } from '../types.ts';
import { MemoryAgentRevisionRepository } from './agent-revision.ts';
import { MemoryArtifactRepository } from './artifact.ts';
import { MemoryCheckpointRepository } from './checkpoint.ts';
import { MemoryConnectionRepository } from './connection.ts';
import { MemoryEffectRepository } from './effect.ts';
import { MemoryIdempotencyRepository } from './idempotency.ts';
import { MemoryLockRepository } from './lock.ts';
import { MemoryRunRepository } from './run.ts';
import { MemoryStateRepository } from './state.ts';
import { MemoryStepRepository } from './step.ts';
import type { MemoryStoreOptions } from './types.ts';

/** Independent in-memory capabilities; each call creates fresh storage. */
export function createMemoryStore(options: MemoryStoreOptions = {}): IStore & {
    conversations: IConversationRepository;
    connections: IConnectionRepository;
} {
    const runs = new MemoryRunRepository(options);
    const hasRun = (runId: string) => runs.has(runId);
    // connection writes are fenced by this store's own locks
    const locks = new MemoryLockRepository(options);

    return {
        runs,
        steps: new MemoryStepRepository({ hasRun }),
        checkpoints: new MemoryCheckpointRepository({ hasRun }),
        idempotency: new MemoryIdempotencyRepository(options),
        locks,
        effects: new MemoryEffectRepository(),
        state: new MemoryStateRepository(),
        artifacts: new MemoryArtifactRepository(),
        agentRevisions: new MemoryAgentRevisionRepository(),
        conversations: new MemoryConversationRepository({ ...options, hasRun }),
        connections: new MemoryConnectionRepository({ ...options, holdsLock: (lock, owner) => locks.holds(lock, owner) }),
    };
}
