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
    MemoryRegistry,
    MemoryRunRepository,
    MemoryStateDocumentRepository,
    MemoryStateRepository,
    MemoryStepRepository,
} from '@chamvi/store-memory';
import type { AgentRevisionServiceContext, IAgentRevisionService  } from '../../src/agent-revision/index.ts';
import { AgentRevisionService } from '../../src/agent-revision/index.ts';
import type { ArtifactServiceContext, IArtifactService  } from '../../src/artifact/index.ts';
import { ArtifactService } from '../../src/artifact/index.ts';
import type { CheckpointServiceContext, ICheckpointService  } from '../../src/checkpoint/index.ts';
import { CheckpointService } from '../../src/checkpoint/index.ts';
import { systemClock } from '../../src/clock/index.ts';
import type { IClock } from '../../src/clock/index.ts';
import type { ConnectionServiceContext, IConnectionService  } from '../../src/connection/index.ts';
import { ConnectionService } from '../../src/connection/index.ts';
import type { ConversationServiceContext, IConversationService  } from '../../src/conversation/index.ts';
import { ConversationService } from '../../src/conversation/index.ts';
import type { EffectServiceContext, IEffectService  } from '../../src/effect/index.ts';
import { EffectService } from '../../src/effect/index.ts';
import { Engine } from '../../src/engine/index.ts';
import type { EngineOptions, IEngine } from '../../src/engine/index.ts';
import type { IIdempotencyService, IdempotencyServiceContext  } from '../../src/idempotency/index.ts';
import { IdempotencyService } from '../../src/idempotency/index.ts';
import type { ILockService, LockServiceContext  } from '../../src/lock/index.ts';
import { LockService } from '../../src/lock/index.ts';
import type { IRunService, RunServiceContext  } from '../../src/run/index.ts';
import { RunService } from '../../src/run/index.ts';
import type { IStateService, StateServiceContext  } from '../../src/state/index.ts';
import { StateService } from '../../src/state/index.ts';
import type { IStepService, StepServiceContext  } from '../../src/step/index.ts';
import { StepService } from '../../src/step/index.ts';

/** The services an engine takes, each by its own name. */
export type TestServices = Pick<
    EngineOptions,
    'runService' | 'stepService' | 'checkpointService' | 'effectService' | 'artifactService' | 'stateService' |
    'agentRevisionService' | 'lockService' | 'idempotencyService' | 'connectionService' | 'conversationService'
>;

/**
 * What `createTestServices()` builds: every service on memory repositories
 * of one registry (the connection service's fence reads the lock rows
 * there), the optional ones too.
 */
export type TestServiceSet = TestServices & {
    connectionService: IConnectionService;
    conversationService: IConversationService;
};

export type TestServicesOptions = {
    clock?: IClock;
    /** Builds the run service, e.g. a subclass that injects a fault. */
    runService?: (ctx: RunServiceContext) => IRunService;
    /** Builds the step service, e.g. a subclass that injects a fault. */
    stepService?: (ctx: StepServiceContext) => IStepService;
    /** Builds the checkpoint service, e.g. a subclass that injects a fault. */
    checkpointService?: (ctx: CheckpointServiceContext) => ICheckpointService;
    /** Builds the effect service, e.g. a subclass that injects a fault. */
    effectService?: (ctx: EffectServiceContext) => IEffectService;
    /** Builds the artifact service, e.g. a subclass that injects a fault. */
    artifactService?: (ctx: ArtifactServiceContext) => IArtifactService;
    /** Builds the state service, e.g. a subclass that injects a fault. */
    stateService?: (ctx: StateServiceContext) => IStateService;
    /** Builds the agent revision service, e.g. a subclass that injects a fault. */
    agentRevisionService?: (ctx: AgentRevisionServiceContext) => IAgentRevisionService;
    /** Builds the lock service, e.g. a subclass that injects a fault. */
    lockService?: (ctx: LockServiceContext) => ILockService;
    /** Builds the idempotency service, e.g. a subclass that injects a fault. */
    idempotencyService?: (ctx: IdempotencyServiceContext) => IIdempotencyService;
    /** Builds the connection service, e.g. a subclass that injects a fault. */
    connectionService?: (ctx: ConnectionServiceContext) => IConnectionService;
    /** Builds the conversation service, e.g. a subclass that injects a fault. */
    conversationService?: (ctx: ConversationServiceContext) => IConversationService;
};

export function createTestServices(options: TestServicesOptions = {}): TestServiceSet {
    const clock = options.clock ?? systemClock;
    const registry = new MemoryRegistry();
    const run: RunServiceContext = { repository: new MemoryRunRepository({ registry }), clock };
    const step: StepServiceContext = { repository: new MemoryStepRepository({ registry }) };
    const checkpoint: CheckpointServiceContext = { repository: new MemoryCheckpointRepository({ registry }) };
    const effect: EffectServiceContext = { repository: new MemoryEffectRepository({ registry }) };
    const artifact: ArtifactServiceContext = { repository: new MemoryArtifactRepository({ registry }) };
    const state: StateServiceContext = {
        repository: new MemoryStateRepository({ registry }),
        documentRepository: new MemoryStateDocumentRepository({ registry }),
    };
    const agentRevision: AgentRevisionServiceContext = { repository: new MemoryAgentRevisionRepository({ registry }) };
    const locks = new MemoryLockRepository({ registry });
    const lock: LockServiceContext = { repository: locks, clock };
    const idempotency: IdempotencyServiceContext = { repository: new MemoryIdempotencyRepository({ registry }), clock };
    const connection: ConnectionServiceContext = { repository: new MemoryConnectionRepository({ registry }), clock };
    const conversation: ConversationServiceContext = { repository: new MemoryConversationRepository({ registry }), clock };

    return {
        runService: options.runService?.(run) ?? new RunService(run),
        stepService: options.stepService?.(step) ?? new StepService(step),
        checkpointService: options.checkpointService?.(checkpoint) ?? new CheckpointService(checkpoint),
        effectService: options.effectService?.(effect) ?? new EffectService(effect),
        artifactService: options.artifactService?.(artifact) ?? new ArtifactService(artifact),
        stateService: options.stateService?.(state) ?? new StateService(state),
        agentRevisionService: options.agentRevisionService?.(agentRevision) ?? new AgentRevisionService(agentRevision),
        lockService: options.lockService?.(lock) ?? new LockService(lock),
        idempotencyService: options.idempotencyService?.(idempotency) ?? new IdempotencyService(idempotency),
        connectionService: options.connectionService?.(connection) ?? new ConnectionService(connection),
        conversationService: options.conversationService?.(conversation) ?? new ConversationService(conversation),
    };
}

export type TestEngineOptions = Omit<EngineOptions, keyof TestServices | 'agents'> & {
    agents?: EngineOptions['agents'];
    /** The services, shared with another engine for a replica; default new ones on `clock`. */
    services?: TestServices;
    /** Another engine to be a replica of: every one of its services. */
    replicaOf?: IEngine;
};

/** The services of a test service set or an engine, each by its own name. */
export function servicesOf(source: TestServices): TestServices {
    return {
        runService: source.runService,
        stepService: source.stepService,
        checkpointService: source.checkpointService,
        effectService: source.effectService,
        artifactService: source.artifactService,
        stateService: source.stateService,
        agentRevisionService: source.agentRevisionService,
        lockService: source.lockService,
        idempotencyService: source.idempotencyService,
        ...(source.connectionService && { connectionService: source.connectionService }),
        ...(source.conversationService && { conversationService: source.conversationService }),
    };
}

/**
 * An engine on memory repositories: core's private copy of
 * `createTestEngine` of `@chamvi/test-kit`, which core cannot depend on.
 */
export function createTestEngine(options: TestEngineOptions = {}): Engine {
    const {
        replicaOf,
        services = replicaOf ?
            servicesOf(replicaOf) :
            createTestServices({ clock: options.clock }),
        agents = [],
        ...rest
    } = options;

    return new Engine({
        ...rest,
        agents,
        ...servicesOf(services),
    });
}
