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
    defineModelAgent,
    defineTool,
    systemClock,
} from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import { openclawChannel } from '@chamvi/channel-openclaw';
import type { OpenclawChannelOptions } from '@chamvi/channel-openclaw';
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

export function createApprovalEngine(
    model: LanguageModel,
    options: Pick<OpenclawChannelOptions, 'fetch' | 'clock'> = {},
): IEngine {
    const {
        OPENCLAW_URL,
        OPENCLAW_HOOKS_TOKEN,
        OPENCLAW_CHANNEL,
        OPENCLAW_TO,
        APP_URL,
    } = process.env;

    if (!OPENCLAW_URL || !OPENCLAW_HOOKS_TOKEN || !OPENCLAW_CHANNEL || !OPENCLAW_TO || !APP_URL) {
        throw new Error('Set OPENCLAW_URL, OPENCLAW_HOOKS_TOKEN, OPENCLAW_CHANNEL, OPENCLAW_TO and APP_URL.');
    }

    const openclaw = openclawChannel({
        baseUrl: OPENCLAW_URL,
        // OpenClaw's hooks.token, not the gateway token
        hooksToken: OPENCLAW_HOOKS_TOKEN,
        deliver: { channel: OPENCLAW_CHANNEL, to: OPENCLAW_TO },
        // a link to the approval in the chamvi UI, without the token
        approvalUrl: ({ runId, approvalId }) => `${APP_URL}/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`,
        ...options,
    });

    const deploy = defineTool({
        description: 'Deploy the current release to an environment.',
        inputSchema: z.object({ env: z.enum(['staging', 'prod']) }),
        execute: async ({ env }, { context }) => {
            // every deploy waits for the owner, who is asked in their chat
            const { approved } = await context.channels.findOneOrFail('openclaw').approve({
                title: `Deploy to ${env}?`,
                body: 'The current release goes out now.',
                address: OPENCLAW_TO,
            });

            return approved ? `deployed to ${env}` : 'the owner said no';
        },
    });

    const deployer = defineModelAgent({
        name: 'deployer',
        model,
        instructions: 'Deploy the release the user asks for.',
        tools: { deploy },
    });

    // runs, steps, checkpoints, effects, artifacts and state in memory, gone with the process: @chamvi/app keeps them in PostgreSQL
    const registry = new MemoryRegistry();
    const runs = new MemoryRunRepository({ registry });
    const locks = new MemoryLockRepository({ registry });

    return new Engine({
        runService: new RunService({ repository: runs, clock: options.clock ?? systemClock }),
        stepService: new StepService({ repository: new MemoryStepRepository({ registry }) }),
        checkpointService: new CheckpointService({ repository: new MemoryCheckpointRepository({ registry }) }),
        effectService: new EffectService({ repository: new MemoryEffectRepository({ registry }) }),
        agentRevisionService: new AgentRevisionService({ repository: new MemoryAgentRevisionRepository({ registry }) }),
        artifactService: new ArtifactService({ repository: new MemoryArtifactRepository({ registry }) }),
        stateService: new StateService({
            repository: new MemoryStateRepository({ registry }),
            documentRepository: new MemoryStateDocumentRepository({ registry }),
        }),
        lockService: new LockService({ repository: locks, clock: options.clock ?? systemClock }),
        idempotencyService: new IdempotencyService({
            repository: new MemoryIdempotencyRepository({ registry }),
            clock: options.clock ?? systemClock,
        }),
        agents: [deployer],
        channels: [openclaw],
        clock: options.clock,
    });
}
