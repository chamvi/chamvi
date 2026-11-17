import type { LanguageModel } from 'ai';
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
    defineModelAgent,
    systemClock,
} from '@chamvi/core';
import { cron, cronChannel } from '@chamvi/channel-cron';
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

export async function startScheduling(model: LanguageModel) {
    const sweep = defineModelAgent({
        name: 'sweep',
        model,
        instructions: 'Close stale issues older than 30 days.',
        // every 30 minutes, Berlin time; skipped while the previous run is active
        channels: [cron.on('*/30 * * * *', { timezone: 'Europe/Berlin' })],
    });

    // memory repositories are per process; with several replicas, use shared ones
    // (e.g. @chamvi/store-db's) so the lock service fires each tick once across them
    // runs, steps, checkpoints, effects, artifacts, state and locks in memory, gone with the process: @chamvi/app keeps them in PostgreSQL
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
        agents: [sweep],
        // every replica registers the same channel; it reads agents and store from the engine
        channels: [cronChannel()],
    });

    // starts the cron channel after recovering runs
    await engine.start();

    // shutdown: drain() stops the channel first, then lets the runs in flight finish
    // await engine.drain();
    return { engine };
}
