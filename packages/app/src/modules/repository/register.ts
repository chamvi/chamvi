/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    MemoryAgentRevisionRepository,
    MemoryArtifactRepository,
    MemoryCheckpointRepository,
    MemoryConnectionRepository,
    MemoryConversationRepository,
    MemoryEffectRepository,
    MemoryIdempotencyRepository,
    MemoryLockRepository,
    MemoryRunRepository,
    MemoryStateDocumentRepository,
    MemoryStateRepository,
    MemoryStepRepository,
} from '@chamvi/store-memory';
import type { MemoryRegistry } from '@chamvi/store-memory';
import type { IContainer } from 'eldin';
import type { DataSource } from 'typeorm';
import { AppToken } from '../../module/constants.ts';
import type { MemoryStoreAggregates } from './types.ts';

/**
 * Registers a memory repository under each repository token, all on
 * `registry` (the connection fence reads the lock rows there), and
 * `STORE_KIND` `memory`. The connection and conversation repositories
 * unless `aggregates` turns them off.
 */
export function registerMemoryRepositories(
    container: IContainer,
    registry: MemoryRegistry,
    aggregates: MemoryStoreAggregates = {},
): void {
    container.register(AppToken.STORE_KIND, { useValue: 'memory' });
    container.register(AppToken.RUN_REPOSITORY, { useValue: new MemoryRunRepository({ registry }) });
    container.register(AppToken.STEP_REPOSITORY, { useValue: new MemoryStepRepository({ registry }) });
    container.register(AppToken.CHECKPOINT_REPOSITORY, { useValue: new MemoryCheckpointRepository({ registry }) });
    container.register(AppToken.EFFECT_REPOSITORY, { useValue: new MemoryEffectRepository({ registry }) });
    container.register(AppToken.ARTIFACT_REPOSITORY, { useValue: new MemoryArtifactRepository({ registry }) });
    container.register(AppToken.STATE_REPOSITORY, { useValue: new MemoryStateRepository({ registry }) });
    container.register(AppToken.STATE_DOCUMENT_REPOSITORY, { useValue: new MemoryStateDocumentRepository({ registry }) });
    container.register(AppToken.LOCK_REPOSITORY, { useValue: new MemoryLockRepository({ registry }) });
    container.register(AppToken.IDEMPOTENCY_REPOSITORY, { useValue: new MemoryIdempotencyRepository({ registry }) });
    container.register(AppToken.AGENT_REVISION_REPOSITORY, { useValue: new MemoryAgentRevisionRepository({ registry }) });

    if (aggregates.connections !== false) {
        container.register(AppToken.CONNECTION_REPOSITORY, { useValue: new MemoryConnectionRepository({ registry }) });
    }

    if (aggregates.conversations !== false) {
        container.register(AppToken.CONVERSATION_REPOSITORY, { useValue: new MemoryConversationRepository({ registry }) });
    }
}

/**
 * Registers a database repository on `dataSource` under each repository
 * token, and `STORE_KIND` `database`. Lazy: an in-memory app never loads
 * `@chamvi/store-db` or TypeORM.
 */
export async function registerDatabaseRepositories(container: IContainer, dataSource: DataSource): Promise<void> {
    const {
        DatabaseAgentRevisionRepository,
        DatabaseArtifactRepository,
        DatabaseCheckpointRepository,
        DatabaseConnectionRepository,
        DatabaseConversationRepository,
        DatabaseEffectRepository,
        DatabaseIdempotencyRepository,
        DatabaseLockRepository,
        DatabaseRunRepository,
        DatabaseStateDocumentRepository,
        DatabaseStateRepository,
        DatabaseStepRepository,
    } = await import('@chamvi/store-db');

    container.register(AppToken.STORE_KIND, { useValue: 'database' });
    container.register(AppToken.RUN_REPOSITORY, { useValue: new DatabaseRunRepository(dataSource) });
    container.register(AppToken.STEP_REPOSITORY, { useValue: new DatabaseStepRepository(dataSource) });
    container.register(AppToken.CHECKPOINT_REPOSITORY, { useValue: new DatabaseCheckpointRepository(dataSource) });
    container.register(AppToken.EFFECT_REPOSITORY, { useValue: new DatabaseEffectRepository(dataSource) });
    container.register(AppToken.ARTIFACT_REPOSITORY, { useValue: new DatabaseArtifactRepository(dataSource) });
    container.register(AppToken.STATE_REPOSITORY, { useValue: new DatabaseStateRepository(dataSource) });
    container.register(AppToken.STATE_DOCUMENT_REPOSITORY, { useValue: new DatabaseStateDocumentRepository(dataSource) });
    container.register(AppToken.LOCK_REPOSITORY, { useValue: new DatabaseLockRepository(dataSource) });
    container.register(AppToken.IDEMPOTENCY_REPOSITORY, { useValue: new DatabaseIdempotencyRepository(dataSource) });
    container.register(AppToken.AGENT_REVISION_REPOSITORY, { useValue: new DatabaseAgentRevisionRepository(dataSource) });
    container.register(AppToken.CONNECTION_REPOSITORY, { useValue: new DatabaseConnectionRepository(dataSource) });
    container.register(AppToken.CONVERSATION_REPOSITORY, { useValue: new DatabaseConversationRepository(dataSource) });
}
