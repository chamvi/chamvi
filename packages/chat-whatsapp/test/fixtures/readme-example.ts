import type { LanguageModel } from 'ai';
import { z } from 'zod';
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
import type { IEngine } from '@chamvi/core';
import { createWhatsAppChat } from '@chamvi/chat-whatsapp';
import type { WhatsAppChatOptions } from '@chamvi/chat-whatsapp';
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

export function createWhatsAppEngine(
    model: LanguageModel,
    // auth: your secure session store; state: a Chat SDK state adapter
    options: Pick<WhatsAppChatOptions, 'auth' | 'state' | 'onPairing' | 'socketFactory' | 'clock'>,
): IEngine {
    const { WHATSAPP_SENDERS, APP_URL } = process.env;

    if (!WHATSAPP_SENDERS || !APP_URL) {
        throw new Error('Set WHATSAPP_SENDERS (phone number jids, comma separated) and APP_URL.');
    }

    const whatsapp = createWhatsAppChat({
        // a non-secret alias of the account, not its phone number
        account: 'assistant',
        // only these senders start runs; everybody else is ignored
        policy: { senders: WHATSAPP_SENDERS.split(',') },
        resolveInvoker: (identity) => ({
            id: identity.sender,
            kind: 'whatsapp',
            bindings: [],
        }),
        // a link to the approval in the chamvi UI: ids only, answered there
        approvalUrl: ({ runId, approvalId }) => `${APP_URL}/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`,
        ...options,
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
        instructions: 'You are the owner\'s assistant on WhatsApp. Answer with the reply tool.',
        // one memory per direct chat and one per group
        conversation: true,
        // direct messages and mentions in an allowed group
        channels: [whatsapp.channel.on()],
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
        channels: [whatsapp.channel],
        clock: options.clock,
        conversations: { authorize: ({ agent }) => agent === 'assistant' },
    });
}
