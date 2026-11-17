/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import {
    AgentRevisionService,
    ArtifactService,
    CheckpointService,
    ConnectionService,
    ConversationService,
    EffectService,
    IdempotencyService,
    LockService,
    RunService,
    StateService,
    StepService,
    systemClock,
} from '@chamvi/core';
import type { IClock } from '@chamvi/core';
import {
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
} from '../../src/index.ts';

/** Every service, each on its database repository over the same data source. */
export function createTestServices(options: { dataSource: DataSource; clock?: IClock }) {
    const { dataSource } = options;
    const clock = options.clock ?? systemClock;

    return {
        runService: new RunService({ repository: new DatabaseRunRepository(dataSource), clock }),
        stepService: new StepService({ repository: new DatabaseStepRepository(dataSource) }),
        checkpointService: new CheckpointService({ repository: new DatabaseCheckpointRepository(dataSource) }),
        effectService: new EffectService({ repository: new DatabaseEffectRepository(dataSource) }),
        artifactService: new ArtifactService({ repository: new DatabaseArtifactRepository(dataSource) }),
        stateService: new StateService({
            repository: new DatabaseStateRepository(dataSource),
            documentRepository: new DatabaseStateDocumentRepository(dataSource),
        }),
        agentRevisionService: new AgentRevisionService({ repository: new DatabaseAgentRevisionRepository(dataSource) }),
        lockService: new LockService({ repository: new DatabaseLockRepository(dataSource), clock }),
        idempotencyService: new IdempotencyService({ repository: new DatabaseIdempotencyRepository(dataSource), clock }),
        connectionService: new ConnectionService({ repository: new DatabaseConnectionRepository(dataSource), clock }),
        conversationService: new ConversationService({ repository: new DatabaseConversationRepository(dataSource), clock }),
    };
}
