import { z } from 'zod';
import { openclawChannel } from '@chamvi/channel-openclaw';
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
    defineTool,
    systemClock,
} from '@chamvi/core';
import type { Agent } from '@chamvi/core';
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

export function createEngine(agents: Agent[]) {
    // #region channel
    const openclaw = openclawChannel({
        // the OpenClaw gateway, reachable from the app
        baseUrl: 'http://openclaw:18789',
        // OpenClaw's hooks.token, not the gateway token
        hooksToken: process.env.OPENCLAW_HOOKS_TOKEN ?? '',
        // placeholders: the channel and recipient of your OpenClaw setup
        deliver: { channel: '<channel>', to: '<recipient>' },
        // optional: a link to the approval in the UI; a message never carries the token
        approvalUrl: ({ runId, approvalId }) => `https://chamvi.example/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`,
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
        agents,
        // tools reach it with ctx.channels.findOneOrFail('openclaw')
        channels: [openclaw],
    });

    // #endregion channel
    return engine;
}

// #region tool
export const deploy = defineTool({
    description: 'Deploy the current release.',
    inputSchema: z.object({ env: z.enum(['staging', 'prod']) }),
    execute: async ({ env }, { context }) => {
        const openclaw = context.channels.findOneOrFail('openclaw');
        // without an address both go to deliver.to (the channel's defaultAddress)
        const { approved } = await openclaw.approve({ title: `Deploy to ${env}?` });

        if (!approved) {
            return 'the owner said no';
        }

        await openclaw.emit({ body: `Deployed to ${env}.` });

        return `deployed to ${env}`;
    },
});
// #endregion tool
