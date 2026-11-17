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
    const lines: string[] = [];

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
                    // answers where the run came from, at most once per message
                    await context.channels.findOne()?.emit({ body: `Labelled as ${label}.` });

                    return { added: label };
                },
            }),
        },
    });

    // everything in memory: a process restart loses it (use @chamvi/store-db in production)
    const registry = new MemoryRegistry();
    const runs = new MemoryRunRepository({ registry });
    const locks = new MemoryLockRepository({ registry });
    const engine = new Engine({
        runService: new RunService({ repository: runs, clock: systemClock }),
        stepService: new StepService({ repository: new MemoryStepRepository({ registry }) }),
        checkpointService: new CheckpointService({ repository: new MemoryCheckpointRepository({ registry }) }),
        effectService: new EffectService({ repository: new MemoryEffectRepository({ registry }) }),
        artifactService: new ArtifactService({ repository: new MemoryArtifactRepository({ registry }) }),
        stateService: new StateService({
            repository: new MemoryStateRepository({ registry }),
            documentRepository: new MemoryStateDocumentRepository({ registry }),
        }),
        agentRevisionService: new AgentRevisionService({ repository: new MemoryAgentRevisionRepository({ registry }) }),
        lockService: new LockService({ repository: locks, clock: systemClock }),
        idempotencyService: new IdempotencyService({ repository: new MemoryIdempotencyRepository({ registry }), clock: systemClock }),
        agents: [triage],
        channels: [consoleChannel({
            write: (line) => {
                lines.push(line);
            },
        })],
    });

    await engine.start();

    const { runId } = await engine.dispatch({
        agent: 'triage',
        trigger: 'manual',
        channel: 'console',
        address: 'issue-1',
        payload: { title: 'App crashes on start' },
    });

    await engine.idle();
    await engine.stop();

    return {
        run: await engine.getRun(runId),
        labels,
        lines,
    };
}
