/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { jsonSchema } from 'ai';
import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    InvalidAgentDefinitionError,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import { mockModel } from '../../utils/mock-model.ts';
import { createTestEngine, createTestServices } from '../../utils/engine.ts';

describe('engine persistence capabilities', () => {
    it('uses a replacement effect store for source sends and terminal conversation reconciliation', async () => {
        const base = createTestServices();
        const unusedEffects = vi.spyOn(base.effectService, 'save');
        const { effectService: effects } = createTestServices();

        vi.spyOn(effects, 'findOne');

        const save = vi.spyOn(effects, 'save');
        const store = { ...base, effectService: effects };

        vi.spyOn(store.conversationService, 'confirmEmit').mockRejectedValueOnce(new Error('confirmation interrupted'));

        const channel = { name: 'chat', out: vi.fn(async () => {}) };
        const model = mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'reply',
                    input: {},
                }],
            },
            { parts: [{ type: 'text', text: 'done' }] },
        ]);
        const engine = createTestEngine({
            services: store,
            agents: [defineModelAgent({
                name: 'helper',
                instructions: 'Help.',
                conversation: true,
                model,
                tools: {
                    reply: defineTool({
                        inputSchema: jsonSchema<{}>({ type: 'object' }),
                        execute: async (_input, { context }) => context.channels.findOneOrFail().emit({ body: 'reply text' }),
                    }),
                },
            })],
            channels: [channel],
            conversations: { authorize: () => true },
        });

        try {
            const { runId } = await engine.channelContext(channel).dispatchConversation({
                agent: 'helper',
                trigger: 'message',
                payload: 'audit-only payload',
                address: 'source',
            }, {
                account: 'main',
                chat: 'private',
                audience: 'direct',
                text: 'accepted user text',
            });

            await engine.start();
            await engine.idle();

            const run = await store.runService.findOne(runId);

            expect(run?.status).toBe('completed');
            expect(channel.out).toHaveBeenCalledTimes(1);
            expect(effects.save).toHaveBeenCalledTimes(1);
            expect(unusedEffects).not.toHaveBeenCalled();

            const effectKey = save.mock.calls[0]![0];

            expect(effects.findOne).toHaveBeenLastCalledWith(effectKey);

            const items = await store.conversationService.findItems(run!.conversation!.scope, { limit: 10, offset: 0 });

            expect(items.data).toMatchObject([
                {
                    role: 'user',
                    text: 'accepted user text',
                    status: 'sent',
                },
                {
                    role: 'assistant',
                    text: 'reply text',
                    status: 'sent',
                },
            ]);

            const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt);

            expect(prompt).toContain('accepted user text');
            expect(prompt).not.toContain('audit-only payload');
        } finally {
            await engine.stop();
        }
    });

    it('requires the conversation service when conversation policy is enabled', () => {
        const store = { ...createTestServices(), conversationService: undefined };

        expect(() => createTestEngine({
            services: store,
            agents: [],
            conversations: { authorize: () => true },
        })).toThrow(new InvalidAgentDefinitionError('Conversations need a conversation service.'));
        expect(createTestEngine({ services: store, agents: [] }).conversationService).toBeUndefined();
    });
});
