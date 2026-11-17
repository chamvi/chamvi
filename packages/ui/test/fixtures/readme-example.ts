import {
    AgentRevisionService,
    ArtifactService,
    CheckpointService,
    EffectService,
    Engine,
    IdempotencyService,
    LockService,
    RunService,
    StateService,
    StepService,
    systemClock,
} from '@chamvi/core';
import { createHttpApp, staticTokens } from '@chamvi/http';
import { uiRoutes } from '@chamvi/ui';
import {
    MemoryAgentRevisionRepository,
    MemoryArtifactRepository,
    MemoryCheckpointRepository,
    MemoryEffectRepository,
    MemoryIdempotencyRepository,
    MemoryLockRepository,
    MemoryRegistry,
    MemoryRunRepository,
    MemoryStateDocumentRepository,
    MemoryStateRepository,
    MemoryStepRepository,
} from '@chamvi/store-memory';

// runs, steps, checkpoints, effects, artifacts and state in memory, gone with the process: @chamvi/app keeps them in PostgreSQL
const registry = new MemoryRegistry();
const runs = new MemoryRunRepository({ registry });
const locks = new MemoryLockRepository({ registry });
const engine = new Engine({
    runService: new RunService({ repository: runs, clock: systemClock }),
    stepService: new StepService({ repository: new MemoryStepRepository({ registry }) }),
    checkpointService: new CheckpointService({ repository: new MemoryCheckpointRepository({ registry }) }),
    effectService: new EffectService({ repository: new MemoryEffectRepository({ registry }) }),
    agentRevisionService: new AgentRevisionService({ repository: new MemoryAgentRevisionRepository({ registry }) }),
    artifactService: new ArtifactService({ repository: new MemoryArtifactRepository({ registry }) }),
    stateService: new StateService({
        repository: new MemoryStateRepository({ registry }),
        documentRepository: new MemoryStateDocumentRepository({ registry }),
    }),
    lockService: new LockService({ repository: locks, clock: systemClock }),
    idempotencyService: new IdempotencyService({ repository: new MemoryIdempotencyRepository({ registry }), clock: systemClock }),
    agents: [],
});

const admin = {
    value: process.env.ADMIN_TOKEN ?? 'admin-token-0123456789',
    id: 'admin',
    permissions: '*' as const,
};

export const app = createHttpApp({
    engine,
    auth: [staticTokens({ tokens: [admin] })],
    // the dashboard at /ui: runs, approvals, agent state and schedules
    routes: uiRoutes(),
});
