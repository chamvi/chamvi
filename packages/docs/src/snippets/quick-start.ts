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
    consoleChannel,
    defineEffectTool,
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

export async function triageIssue(model: LanguageModel) {
    const labels: string[] = [];

    const triage = defineModelAgent({
        name: 'triage',
        model,
        instructions: 'Label the issue in the trigger payload as bug, feature or question.',
        budget: { maxSteps: 5 },
        tools: {
            // the result is recorded per (run, tool, input): a resumed run reuses it
            addLabel: defineEffectTool({
                description: 'Adds a label to the issue.',
                inputSchema: z.object({ label: z.enum(['bug', 'feature', 'question']) }),
                execute: async ({ label }, { context }) => {
                    labels.push(label);
                    // answers where the run came from (here: the console), once per message
                    await context.channels.findOne()?.emit({ body: `Labelled as ${label}.` });

                    return { added: label };
                },
            }),
        },
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
        agents: [triage],
        // logs every message a tool sends through it
        channels: [consoleChannel()],
    });

    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'triage',
        trigger: 'manual',
        channel: 'console',
        // where the run came from on that channel; ctx.channels.findOne() answers there
        address: 'issue-1',
        payload: { title: 'App crashes on start' },
    });

    await engine.idle();
    await engine.stop();

    return { run: await engine.getRun(runId), labels };
}
