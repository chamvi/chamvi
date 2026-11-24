/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    AgentRevisionService,
    AppToken,
    ArtifactService,
    CheckpointService,
    ConnectionService,
    ConversationService,
    EffectService,
    Engine,
    IdempotencyService,
    LimitService,
    LockService,
    ModuleName,
    RunService,
    StateService,
    StepService,
    systemClock,
} from '@chamvi/app';
import type {
    EngineOptions,
    IClock,
    IModule,
} from '@chamvi/app';
import {
    MemoryAgentRevisionRepository,
    MemoryArtifactRepository,
    MemoryCheckpointRepository,
    MemoryConnectionRepository,
    MemoryConversationRepository,
    MemoryEffectRepository,
    MemoryIdempotencyRepository,
    MemoryLimitRepository,
    MemoryLockRepository,
    MemoryRegistry,
    MemoryRunRepository,
    MemoryStateDocumentRepository,
    MemoryStateRepository,
    MemoryStepRepository,
} from '@chamvi/store-memory';
import type { IConnectionRepository, IConversationRepository } from '@chamvi/store';

/**
 * Memory repositories on one registry and the services on them: the specs
 * seed and read through the services, `storeModuleOf()` hands the same
 * repositories to the app.
 */
export function createTestStore(options: { clock?: IClock } = {}) {
    const clock = options.clock ?? systemClock;
    const registry = new MemoryRegistry();
    const runRepository = new MemoryRunRepository({ registry });
    const stepRepository = new MemoryStepRepository({ registry });
    const checkpointRepository = new MemoryCheckpointRepository({ registry });
    const effectRepository = new MemoryEffectRepository({ registry });
    const artifactRepository = new MemoryArtifactRepository({ registry });
    const stateRepository = new MemoryStateRepository({ registry });
    const stateDocumentRepository = new MemoryStateDocumentRepository({ registry });
    const lockRepository = new MemoryLockRepository({ registry });
    const idempotencyRepository = new MemoryIdempotencyRepository({ registry });
    const limitRepository = new MemoryLimitRepository({ registry });
    const agentRevisionRepository = new MemoryAgentRevisionRepository({ registry });
    const connectionRepository = new MemoryConnectionRepository({ registry });
    const conversationRepository = new MemoryConversationRepository({ registry });

    return {
        registry,
        runRepository,
        stepRepository,
        checkpointRepository,
        effectRepository,
        artifactRepository,
        stateRepository,
        stateDocumentRepository,
        lockRepository,
        idempotencyRepository,
        limitRepository,
        agentRevisionRepository,
        connectionRepository,
        conversationRepository,
        runService: new RunService({ repository: runRepository, clock }),
        stepService: new StepService({ repository: stepRepository }),
        checkpointService: new CheckpointService({ repository: checkpointRepository }),
        effectService: new EffectService({ repository: effectRepository }),
        artifactService: new ArtifactService({ repository: artifactRepository }),
        stateService: new StateService({ repository: stateRepository, documentRepository: stateDocumentRepository }),
        lockService: new LockService({ repository: lockRepository, clock }),
        idempotencyService: new IdempotencyService({ repository: idempotencyRepository, clock }),
        limitService: new LimitService({ repository: limitRepository, clock }),
        agentRevisionService: new AgentRevisionService({ repository: agentRevisionRepository }),
        connectionService: new ConnectionService({ repository: connectionRepository, clock }),
        conversationService: new ConversationService({ repository: conversationRepository, clock }),
    };
}

export type TestStore = ReturnType<typeof createTestStore>;

/**
 * A module replacing the store module, as a third-party store would: it
 * registers the test store's repositories under their tokens, and the app
 * builds the services from them. `connectionRepository: null` keeps no
 * connections, `conversationRepository: null` no conversations.
 */
export function storeModuleOf(store: Omit<TestStore, 'connectionRepository' | 'conversationRepository'> & {
    connectionRepository: IConnectionRepository | null;
    conversationRepository?: IConversationRepository | null;
}): IModule {
    return {
        name: ModuleName.STORE,
        dependencies: [ModuleName.CONFIG],
        setup(container) {
            container.register(AppToken.STORE_KIND, { useValue: 'memory' });
            container.register(AppToken.RUN_REPOSITORY, { useValue: store.runRepository });
            container.register(AppToken.STEP_REPOSITORY, { useValue: store.stepRepository });
            container.register(AppToken.CHECKPOINT_REPOSITORY, { useValue: store.checkpointRepository });
            container.register(AppToken.EFFECT_REPOSITORY, { useValue: store.effectRepository });
            container.register(AppToken.ARTIFACT_REPOSITORY, { useValue: store.artifactRepository });
            container.register(AppToken.STATE_REPOSITORY, { useValue: store.stateRepository });
            container.register(AppToken.STATE_DOCUMENT_REPOSITORY, { useValue: store.stateDocumentRepository });
            container.register(AppToken.LOCK_REPOSITORY, { useValue: store.lockRepository });
            container.register(AppToken.IDEMPOTENCY_REPOSITORY, { useValue: store.idempotencyRepository });
            container.register(AppToken.LIMIT_REPOSITORY, { useValue: store.limitRepository });
            container.register(AppToken.AGENT_REVISION_REPOSITORY, { useValue: store.agentRevisionRepository });

            if (store.connectionRepository) {
                container.register(AppToken.CONNECTION_REPOSITORY, { useValue: store.connectionRepository });
            }

            if (store.conversationRepository) {
                container.register(AppToken.CONVERSATION_REPOSITORY, { useValue: store.conversationRepository });
            }

            return Promise.resolve();
        },
    };
}

/** The services of an engine over a test store (each by its own name). */
type EngineServices = 'runService' | 'stepService' | 'checkpointService' | 'effectService' | 'artifactService' | 'stateService' |
    'lockService' | 'idempotencyService' | 'agentRevisionService' | 'connectionService' | 'conversationService' | 'limitService';

/**
 * An engine over a test store and its services, as another replica of the
 * app the store module builds over the same repositories (to queue or
 * seed runs before the app starts).
 */
export function engineOver(store: TestStore, options: Omit<EngineOptions, EngineServices>): Engine {
    return new Engine({
        ...options,
        runService: store.runService,
        stepService: store.stepService,
        checkpointService: store.checkpointService,
        effectService: store.effectService,
        artifactService: store.artifactService,
        stateService: store.stateService,
        lockService: store.lockService,
        idempotencyService: store.idempotencyService,
        limitService: store.limitService,
        agentRevisionService: store.agentRevisionService,
        connectionService: store.connectionService,
        conversationService: store.conversationService,
    });
}
