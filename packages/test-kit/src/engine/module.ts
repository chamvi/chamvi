/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    AgentRevisionService,
    ArtifactService,
    CheckpointService,
    ConnectionService,
    ConversationService,
    EffectService,
    Engine,
    IdempotencyService,
    InvalidAgentDefinitionError,
    LimitService,
    LockService,
    RunService,
    StateService,
    StepService,
    systemClock,
} from '@chamvi/core';
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
import type { TestEngineOptions } from './types.ts';

/**
 * An engine on memory repositories: the services on one memory registry,
 * on the engine's clock (`options.clock`, default the system clock). Read
 * and seed through the engine's services (`engine.runService`,
 * `engine.checkpointService`, ...). Its connection service
 * (`engine.connectionService`) is on the same registry, so its fence reads
 * the leases of `engine.lockService`; its conversation service
 * (`engine.conversationService`) too, so its rows reference the runs there;
 * and its limit service (`engine.limitService`), so agents with `limits` register.
 * `replicaOf` builds a replica of another engine.
 */
export function createTestEngine(options: TestEngineOptions): Engine {
    const {
        replicaOf,
        conversationService: wrap,
        ...rest
    } = options;
    const clock = options.clock ?? replicaOf?.clock ?? systemClock;

    if (replicaOf) {
        if (wrap) {
            throw new InvalidAgentDefinitionError('createTestEngine() takes a replica\'s conversation service from replicaOf, not from conversationService.');
        }

        // the services of replicaOf read replicaOf's clock: a replica on another one would decide on two clocks
        if (options.clock && options.clock !== replicaOf.clock) {
            throw new InvalidAgentDefinitionError('createTestEngine() runs a replica on the clock of replicaOf; pass that clock or none.');
        }

        return new Engine({
            ...rest,
            clock,
            runService: replicaOf.runService,
            stepService: replicaOf.stepService,
            checkpointService: replicaOf.checkpointService,
            effectService: replicaOf.effectService,
            artifactService: replicaOf.artifactService,
            stateService: replicaOf.stateService,
            agentRevisionService: replicaOf.agentRevisionService,
            lockService: replicaOf.lockService,
            idempotencyService: replicaOf.idempotencyService,
            ...(replicaOf.connectionService && { connectionService: replicaOf.connectionService }),
            ...(replicaOf.conversationService && { conversationService: replicaOf.conversationService }),
            ...(replicaOf.limitService && { limitService: replicaOf.limitService }),
        });
    }

    const registry = new MemoryRegistry();
    const runs = new MemoryRunRepository({ registry });
    const locks = new MemoryLockRepository({ registry });
    const conversationService = new ConversationService({ repository: new MemoryConversationRepository({ registry }), clock });

    return new Engine({
        ...rest,
        clock,
        runService: new RunService({ repository: runs, clock }),
        stepService: new StepService({ repository: new MemoryStepRepository({ registry }) }),
        checkpointService: new CheckpointService({ repository: new MemoryCheckpointRepository({ registry }) }),
        effectService: new EffectService({ repository: new MemoryEffectRepository({ registry }) }),
        artifactService: new ArtifactService({ repository: new MemoryArtifactRepository({ registry }) }),
        stateService: new StateService({
            repository: new MemoryStateRepository({ registry }),
            documentRepository: new MemoryStateDocumentRepository({ registry }),
        }),
        agentRevisionService: new AgentRevisionService({ repository: new MemoryAgentRevisionRepository({ registry }) }),
        lockService: new LockService({ repository: locks, clock }),
        idempotencyService: new IdempotencyService({ repository: new MemoryIdempotencyRepository({ registry }), clock }),
        connectionService: new ConnectionService({ repository: new MemoryConnectionRepository({ registry }), clock }),
        conversationService: wrap ? wrap(conversationService) : conversationService,
        limitService: new LimitService({ repository: new MemoryLimitRepository({ registry }), clock }),
    });
}
