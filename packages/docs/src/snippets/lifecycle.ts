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

export async function watchRuns(model: LanguageModel) {
    const agent = defineModelAgent({
        name: 'echo',
        model,
        instructions: 'Repeat the payload.',
    });
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
        agents: [agent],
    });

    // #region events
    const offRun = engine.on('run.updated', (event) => {
        if (event.type === 'run.updated') {
            console.log(event.run.id, event.run.status);
        }
    });
    const offStep = engine.on('step.appended', (event) => {
        if (event.type === 'step.appended') {
            console.log(event.step.runId, event.step.index, event.step.kind);
        }
    });
    // #endregion events

    // #region deltas
    const offDelta = engine.on('run.delta', ({ delta }) => {
        // text or reasoning as the model streams it; never stored
        if (delta.kind === 'text') {
            process.stdout.write(delta.text);
        }
    });
    // #endregion deltas

    await engine.start();
    await engine.dispatch({
        agent: 'echo',
        trigger: 'http',
        channel: 'http',
        payload: 'hello',
    });
    await engine.idle();
    await engine.stop();

    offRun();
    offStep();
    offDelta();
}
