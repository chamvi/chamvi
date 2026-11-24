/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { z } from 'zod';
import { defineModelAgent, defineTool } from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import type { ApprovalWaitPoint, Invoker } from '@chamvi/store';
import { approvalModel, mockModel, textModel } from '@chamvi/test-kit';
import {
    ALICE,
    createWhatsAppFixture,
    settle,
    waMessage,
} from '../../utils/whatsapp.ts';
import type { WhatsAppFixture } from '../../utils/whatsapp.ts';

const ADDRESS_THREAD = `whatsapp:${ALICE}`;

const approver = (id: string): Invoker => ({
    id,
    kind: 'whatsapp',
    bindings: [{ permission: { name: 'chamvi_agent_run' } }, { permission: { name: 'chamvi_agent_approve' } }],
});

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

/** A connected WhatsApp channel with `answers` on and an asker whose approval reached ALICE's chat. */
async function asked(): Promise<{
    value: WhatsAppFixture;
    runId: string;
    sentId: string
}> {
    const value = createWhatsAppFixture({
        patch: {
            answers: { model: mockModel([{ parts: [{ type: 'text', text: JSON.stringify({ decision: 'approve' }) }] }]) },
            resolveInvoker: (identity) => approver(identity.sender),
        },
        agents: (channel) => {
            const address = channel.to({ adapter: 'whatsapp', threadId: ADDRESS_THREAD });
            const ask = defineTool({
                inputSchema: z.object({ title: z.string() }),
                execute: async (input, { context }) => {
                    const decision = await context.channels.findOneOrFail(channel.name).approve({ title: input.title, address });

                    return decision.approved ? 'approved' : 'denied';
                },
            });

            return [
                defineModelAgent({
                    name: 'asker',
                    instructions: 'Ask.',
                    model: approvalModel('ask', { title: 'deploy' }),
                    tools: { ask },
                }),
                defineModelAgent({
                    name: 'assistant',
                    instructions: 'Answer.',
                    model: textModel(),
                    channels: [channel.on()],
                }),
            ];
        },
    });

    engines.push(value.engine);
    await value.engine.start();
    value.sockets.last().open();

    const { runId } = await value.engine.dispatch({
        agent: 'asker',
        trigger: 'test',
        channel: value.channel.name,
        address: value.channel.to({ adapter: 'whatsapp', threadId: ADDRESS_THREAD }),
        payload: {},
    });

    await value.engine.idle();
    await vi.waitFor(async () => {
        const run = await value.engine.runService.findOne(runId);

        expect((run?.waiting as ApprovalWaitPoint | undefined)?.notifiedAt).toBeDefined();
    });

    const sent = value.sockets.last().sent.at(-1);

    expect(sent?.jid).toBe(ALICE);
    expect(sent?.messageId).toMatch(/^3EB0[0-9A-F]{36}$/);

    return {
        value,
        runId,
        sentId: sent!.messageId!,
    };
}

/** seconds after the fixture clock's now: a reply sent after the approval reached the chat */
function later(value: WhatsAppFixture): number {
    return Math.ceil(value.clock.now() / 1000) + 60;
}

describe('WhatsApp approval answers', () => {
    it('a direct reply quoting the approval message answers it: the run leaves waiting approved', async () => {
        const {
            value,
            runId,
            sentId,
        } = await asked();

        value.sockets.last().deliver(waMessage({
            chat: ALICE,
            text: 'go ahead',
            quoted: { id: sentId },
            timestamp: later(value),
        }));
        await settle();
        await value.engine.idle();

        await vi.waitFor(async () => {
            const run = await value.engine.runService.findOne(runId);

            expect(run?.status).toBe('completed');
        });

        const steps = await value.engine.stepService.find(runId);

        expect(steps.find((step) => step.kind === 'wait')).toMatchObject({ output: expect.objectContaining({ approved: true }) });
        expect((await value.runs()).filter((run) => run.agent === 'assistant')).toEqual([]);
        expect(value.errors).toEqual([]);
    });

    it('a reply quoting another message is no answer: it starts a run as usual', async () => {
        const { value, runId } = await asked();

        value.sockets.last().deliver(waMessage({
            chat: ALICE,
            text: 'go ahead',
            quoted: { id: '3EB0OTHER' },
            timestamp: later(value),
        }));
        await settle();
        await value.engine.idle();

        await vi.waitFor(async () => {
            expect((await value.runs()).filter((run) => run.agent === 'assistant')).toHaveLength(1);
        });
        expect((await value.engine.runService.findOne(runId))?.status).toBe('waiting');
    });
});
