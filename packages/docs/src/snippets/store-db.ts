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
    DatabaseAgentRevisionRepository,
    DatabaseArtifactRepository,
    DatabaseCheckpointRepository,
    DatabaseEffectRepository,
    DatabaseIdempotencyRepository,
    DatabaseLockRepository,
    DatabaseRunRepository,
    DatabaseStateDocumentRepository,
    DatabaseStateRepository,
    DatabaseStepRepository,
    STORE_ENTITIES,
    STORE_MIGRATIONS,
    migrateStore,
} from '@chamvi/store-db';
import { DataSource } from 'typeorm';

export async function createEngine(model: LanguageModel) {
    const triage = defineModelAgent({
        name: 'triage',
        model,
        instructions: 'Triage the issue.',
    });

    // #region setup
    const dataSource = new DataSource({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: STORE_ENTITIES,
        migrations: STORE_MIGRATIONS,
    });

    await dataSource.initialize();
    await migrateStore(dataSource);

    const engine = new Engine({
        // runs, steps, checkpoints, effects, artifacts, state, locks and idempotency keys: services over the database repositories
        runService: new RunService({ repository: new DatabaseRunRepository(dataSource), clock: systemClock }),
        stepService: new StepService({ repository: new DatabaseStepRepository(dataSource) }),
        checkpointService: new CheckpointService({ repository: new DatabaseCheckpointRepository(dataSource) }),
        effectService: new EffectService({ repository: new DatabaseEffectRepository(dataSource) }),
        agentRevisionService: new AgentRevisionService({ repository: new DatabaseAgentRevisionRepository(dataSource) }),
        artifactService: new ArtifactService({ repository: new DatabaseArtifactRepository(dataSource) }),
        stateService: new StateService({
            repository: new DatabaseStateRepository(dataSource),
            documentRepository: new DatabaseStateDocumentRepository(dataSource),
        }),
        lockService: new LockService({ repository: new DatabaseLockRepository(dataSource), clock: systemClock }),
        idempotencyService: new IdempotencyService({ repository: new DatabaseIdempotencyRepository(dataSource), clock: systemClock }),
        agents: [triage],
    });
    // #endregion setup

    // #region purge
    // expired keys and locks stay until purged: purge every hour
    const purge = setInterval(() => {
        Promise.all([engine.idempotencyService.purgeExpired(), engine.lockService.purgeExpired()])
            .catch((e: unknown) => console.error(e));
    }, 60 * 60 * 1000);

    purge.unref();
    // #endregion purge

    // #region shutdown
    // the store never destroys the data source: the app closes it last
    const shutdown = async () => {
        clearInterval(purge);
        await engine.drain();
        await dataSource.destroy();
    };
    // #endregion shutdown

    return { engine, shutdown };
}
