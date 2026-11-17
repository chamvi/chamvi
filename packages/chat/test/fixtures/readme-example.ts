import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { Chat } from 'chat';
import type { Adapter, StateAdapter } from 'chat';
import {
    AgentRevisionService,
    ArtifactService,
    CheckpointService,
    ConversationService,
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
import type { IClock, IEngine } from '@chamvi/core';
import { chatChannel, createChatIngressAdapter } from '@chamvi/chat';
import {
    MemoryAgentRevisionRepository,
    MemoryArtifactRepository,
    MemoryCheckpointRepository,
    MemoryConversationRepository,
    MemoryEffectRepository,
    MemoryIdempotencyRepository,
    MemoryLockRepository,
    MemoryRegistry,
    MemoryRunRepository,
    MemoryStateDocumentRepository,
    MemoryStateRepository,
    MemoryStepRepository,
} from '@chamvi/store-memory';

export function createChatEngine(
    model: LanguageModel,
    // adapter: any Chat SDK adapter whose platform posts webhooks; state: a Chat SDK state adapter
    options: {
        adapter: Adapter;
        state: StateAdapter;
        clock?: IClock
    },
): IEngine {
    const { CHAT_USERS, APP_URL } = process.env;

    if (!CHAT_USERS || !APP_URL) {
        throw new Error('Set CHAT_USERS (platform user ids, comma separated) and APP_URL.');
    }

    const allowed = new Set(CHAT_USERS.split(','));

    // chamvi's intake, not the Chat SDK's handlers, accepts the adapter's messages
    const ingress = createChatIngressAdapter(options.adapter);
    const chat = new Chat({
        userName: 'chamvi',
        adapters: { [ingress.name]: ingress },
        state: options.state,
        logger: 'warn',
        concurrency: 'concurrent',
    });

    const channel = chatChannel({
        chat,
        adapters: [ingress],
        // the platform posts to POST /channels/chat/<adapter> (the http app's channel mount)
        webhooks: [ingress.name],
        // only these users start runs; everybody else is ignored
        allowMessage: ({ message }) => allowed.has(message.author.userId),
        resolveInvoker: ({ message }) => ({
            id: message.author.userId,
            kind: 'chat',
            bindings: [],
        }),
        // a link to the approval in the chamvi UI: ids only, answered there
        approvalUrl: ({ runId, approvalId }) => `${APP_URL}/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`,
    });

    const reply = defineTool({
        description: 'Reply in the chat the message came from.',
        inputSchema: z.object({ text: z.string() }),
        execute: async ({ text }, { context }) => {
            // the source chat: no address needed
            await context.channels.findOneOrFail('chat').emit({ body: text });

            return 'sent';
        },
    });

    const assistant = defineModelAgent({
        name: 'assistant',
        model,
        instructions: 'You are the team\'s assistant. Answer with the reply tool.',
        // one memory per direct chat and one per group
        conversation: true,
        // direct messages and mentions in a group
        channels: [channel.on()],
        tools: { reply },
    });

    // runs, steps, checkpoints, effects, artifacts, state and conversations in memory, gone with the process: @chamvi/app keeps them in PostgreSQL
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
        // conversations in memory too; use @chamvi/store-db in production
        conversationService: new ConversationService({
            repository: new MemoryConversationRepository({ registry }),
            clock: options.clock ?? systemClock,
        }),
        agents: [assistant],
        channels: [channel],
        clock: options.clock,
        conversations: { authorize: ({ agent }) => agent === 'assistant' },
    });
}
