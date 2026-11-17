/* eslint @tada5hi/type-declaration-location: "off" -- Keep the exported contract in the self-contained instructional snippet. */
import type { LanguageModel } from 'ai';
import { z } from 'zod';
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
    defineContextKey,
    defineModelAgent,
    defineTool,
    inject,
    systemClock,
    tryInject,
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

declare const model: LanguageModel;

// #region define
export interface IDeployClient {
    deploy(version: string, signal: AbortSignal): Promise<string>;
}

// a typed key, unique per call; the name only appears in error messages
export const DEPLOY = defineContextKey<IDeployClient>('deploy');
// #endregion define

declare const client: IDeployClient;
declare const auditLog: { write(line: string): void } | undefined;

// #region inject
// in execute: a missing value is a tool error the model sees
const deploy = defineTool({
    description: 'Deploys a version.',
    inputSchema: z.object({ version: z.string() }),
    execute: async ({ version }, { context }) => inject(context, DEPLOY).deploy(version, context.run.signal),
});

const AUDIT = defineContextKey<{ write(line: string): void }>('audit');

export const ops = defineModelAgent({
    name: 'ops',
    model,
    instructions: 'Operate the service.',
    // in the factory: tryInject reads an optional value (inject would fail the run before any model call)
    tools: (ctx) => {
        const audit = tryInject(ctx, AUDIT);

        audit?.write(`run ${ctx.run.runId} started`);

        return { deploy };
    },
});
// #endregion inject

// #region provide
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
    agents: [ops],
});

// by reference, once per key; a second value or undefined throws
engine.provide(DEPLOY, client);

if (auditLog) {
    engine.provide(AUDIT, auditLog);
}
// #endregion provide

export { engine };
