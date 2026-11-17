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
    createHttpApp,
    createShutdown,
    http,
    httpChannel,
    mcpChannel,
    staticTokens,
} from '@chamvi/http';
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

export async function createAgentServer(model: LanguageModel) {
    const echo = defineModelAgent({
        name: 'echo',
        model,
        instructions: 'Answer with a short summary of the payload.',
        // http.on() lets REST (POST /agents/echo/runs) and MCP (run_echo) start runs
        channels: [http.on()],
    });

    // runs and the rest in memory: gone with the process (@chamvi/app keeps them in PostgreSQL)
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
        agents: [echo],
        // REST runs carry channel http, MCP runs channel mcp
        channels: [httpChannel(), mcpChannel()],
    });

    const token = process.env.CHAMVI_TOKEN;

    if (!token) {
        throw new Error('Set CHAMVI_TOKEN (at least 16 characters).');
    }

    const shutdown = createShutdown({ engine });
    const app = createHttpApp({
        // routes read the services, the agents and the clock from the engine
        engine,
        auth: staticTokens({
            tokens: [{
                value: token,
                id: 'ci',
                permissions: '*',
            }],
        }),
        shutdown,
    });

    await engine.start();

    // serve it with routup (srvx); let createShutdown own SIGTERM:
    // const server = serve(app, { port: 3000, gracefulShutdown: false });
    // process.once('SIGTERM', () => shutdown.shutdown());
    return {
        app,
        engine,
        shutdown,
    };
}
