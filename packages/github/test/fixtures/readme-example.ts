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
    ToolDeniedError,
    defineModelAgent,
    systemClock,
} from '@chamvi/core';
import { createGithubApp, github, githubChannel } from '@chamvi/github';
import type { GithubAppOptions } from '@chamvi/github';
import { createHttpApp, createShutdown, staticTokens } from '@chamvi/http';
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

export async function createTriageServer(
    model: LanguageModel,
    options: Pick<GithubAppOptions, 'fetch' | 'clock'> = {},
) {
    const {
        GITHUB_APP_ID,
        GITHUB_PRIVATE_KEY,
        GITHUB_WEBHOOK_SECRET,
        CHAMVI_TOKEN,
    } = process.env;

    if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY || !GITHUB_WEBHOOK_SECRET || !CHAMVI_TOKEN) {
        throw new Error('Set GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET and CHAMVI_TOKEN.');
    }

    const gh = createGithubApp({
        appId: GITHUB_APP_ID,
        privateKey: GITHUB_PRIVATE_KEY,
        webhookSecret: GITHUB_WEBHOOK_SECRET,
        ...options,
    });
    // runs, steps, checkpoints, effects, artifacts and state in memory, gone with the process: @chamvi/app keeps them in PostgreSQL
    const registry = new MemoryRegistry();
    const runs = new MemoryRunRepository({ registry });
    const locks = new MemoryLockRepository({ registry });
    const lockService = new LockService({ repository: locks, clock: systemClock });
    // deliveries in, issue comments out; named comment slots are coordinated through the lock service
    const channel = githubChannel({
        app: gh,
        locks: lockService,
        clock: options.clock,
    });

    const triage = defineModelAgent({
        name: 'triage',
        model,
        instructions: 'Label new issues and thank the author in one comment.',
        // one run per issues.opened delivery, deduplicated by the delivery id
        channels: [github.on('issues.opened')],
        tools: () => ({ ...gh.readTools(), ...gh.writeTools() }),
        hooks: {
            // closing waits for the owner, asked in a comment on the issue
            async beforeToolExecution({ toolName, input }, ctx) {
                if (toolName !== 'github_close_issue') {
                    return undefined;
                }

                const { approved } = await ctx.channels.findOneOrFail('github').approve({
                    title: 'Close this issue?',
                    body: JSON.stringify(input),
                });

                if (!approved) {
                    throw new ToolDeniedError('The owner keeps the issue open.');
                }

                return undefined;
            },
        },
    });

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
        lockService,
        idempotencyService: new IdempotencyService({ repository: new MemoryIdempotencyRepository({ registry }), clock: systemClock }),
        agents: [triage],
        channels: [channel],
    });

    const shutdown = createShutdown({ engine });
    const app = createHttpApp({
        engine,
        auth: staticTokens({
            tokens: [{
                value: CHAMVI_TOKEN,
                id: 'ci',
                permissions: '*',
            }],
        }),
        // POST /channels/github: point the App's webhook URL here
        channels: [channel],
        shutdown,
    });

    await engine.start();

    return {
        app,
        engine,
        shutdown,
    };
}
