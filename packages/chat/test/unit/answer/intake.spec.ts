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
import {
    InvalidRunStateError,
    defineEffectTool,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import type { Agent, IEngine } from '@chamvi/core';
import type { LanguageModel } from 'ai';
import type { ApprovalWaitPoint, Invoker, Run } from '@chamvi/store';
import {
    CHAT_ANSWER_NOTICE_CLOSED,
    CHAT_ANSWER_NOTICE_SEVERAL,
    chatAddress,
} from '@chamvi/chat';
import type { ChatChannel, ChatChannelOptions, IChatPlatform } from '@chamvi/chat';
import {
    approvalModel,
    failingModel,
    mockModel,
} from '@chamvi/test-kit';
import { createTextMessage } from '../../utils/adapter.ts';
import { createIntakeFixture, flush } from '../../utils/intake.ts';
import type { IntakeFixture } from '../../utils/intake.ts';
import { hashKey } from '../../../src/channel/helpers.ts';

const ADDRESS = chatAddress({ adapter: 'fake', threadId: 'fake:chat-1' });

const owner: Invoker = {
    id: 'owner',
    kind: 'chat',
    bindings: [{ permission: { name: 'chamvi_agent_run' } }, { permission: { name: 'chamvi_agent_approve' } }],
};

const runner: Invoker = {
    id: 'runner',
    kind: 'chat',
    bindings: [{ permission: { name: 'chamvi_agent_run' } }],
};

const ask = defineTool({
    inputSchema: z.object({ title: z.string() }),
    execute: async (input, { context }) => {
        const decision = await context.channels.findOneOrFail('chat').approve({ title: input.title, address: ADDRESS });

        return decision.approved ? 'approved' : 'denied';
    },
});

const send = defineEffectTool({
    inputSchema: z.object({}),
    trust: { guardWhenTainted: true },
    execute: async () => 'sent',
});

function asker(name: string, gated = false): Agent {
    return defineModelAgent({
        name,
        instructions: 'Ask.',
        model: approvalModel(gated ? 'send' : 'ask', gated ? {} : { title: `deploy ${name}` }),
        tools: gated ? { send } : { ask },
    });
}

/** Asks `A`, then (once answered) `B` at the same address. */
function twiceAsker(name: string): Agent {
    return defineModelAgent({
        name,
        instructions: 'Ask twice.',
        model: mockModel([
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'ask',
                    input: { title: 'A' },
                }],
            },
            {
                parts: [{
                    type: 'tool-call',
                    toolName: 'ask',
                    input: { title: 'B' },
                }],
            },
            { parts: [{ type: 'text', text: 'done' }] },
        ]),
        tools: { ask },
    });
}

function assistant(channel: ChatChannel): Agent {
    return defineModelAgent({
        name: 'assistant',
        instructions: 'Answer.',
        model: mockModel(Array.from({ length: 5 }, () => ({ parts: [{ type: 'text' as const, text: 'hi' }] }))),
        channels: [channel.on()],
    });
}

/** A classifier answering `decision` (once). */
function classifier(decision: string) {
    return mockModel([{ parts: [{ type: 'text', text: JSON.stringify({ decision }) }] }]);
}

/** A platform naming the message it sent under a key `m:<key>`, recording the keys it posts; its posts fail while `state.failing`. */
function quoting(fixture: () => IntakeFixture, keys: string[], state: { failing: boolean }): IChatPlatform {
    return {
        sentMessageId: ({ key }) => `m:${key}`,
        prepare: (send) => {
            keys.push(send.key);

            return async () => {
                if (state.failing) {
                    throw new Error('post failed');
                }

                return fixture().adapter.postMessage(send.threadId, { raw: send.text });
            };
        },
    };
}

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

type Setup = {
    model?: LanguageModel | string;
    answers?: boolean;
    invoker?: Invoker;
    askers?: Agent[];
    patch?: Partial<ChatChannelOptions>;
    /** the platform's posts fail from the start, so no approval is delivered */
    failing?: boolean;
};

async function setup(input: Setup = {}) {
    const keys: string[] = [];
    const state = { failing: input.failing === true };
    const askers = input.askers ?? [asker('asker')];
    // the platform reads the fixture only once it posts
    const fixture: IntakeFixture = createIntakeFixture({
        agents: (channel) => [...askers, assistant(channel)],
        patch: {
            ...(input.answers === false ? { approvalUrl: ({ runId }) => `https://chamvi.test/approvals/${runId}` } : { answers: { ...(input.model ? { model: input.model } : {}) } }),
            resolveInvoker: () => input.invoker ?? owner,
            platform: quoting(() => fixture, keys, state),
            ...input.patch,
        },
    });

    engines.push(fixture.engine);
    await fixture.engine.start();

    const ids: string[] = [];

    for (const agent of askers) {
        const { runId } = await fixture.engine.dispatch({
            agent: agent.name,
            trigger: 'test',
            channel: 'chat',
            address: ADDRESS,
            payload: {},
        });

        ids.push(runId);
        await fixture.engine.idle();
        await vi.waitFor(async () => {
            const run = await fixture.engine.runService.findOne(runId);

            expect(run?.status).toBe('waiting');

            if (!state.failing) {
                expect((run?.waiting as ApprovalWaitPoint).notifiedAt).toBeDefined();
            }
        });
        fixture.clock.advance(1);
    }

    const run = async (id: string) => (await fixture.engine.runService.findOne(id))!;
    const wait = async (id: string) => (await fixture.engine.stepService.find(id)).find((step) => step.kind === 'wait');
    const assistantRuns = async () => (await fixture.runs()).filter((item: Run) => item.agent === 'assistant');
    const approvalId = async (id: string) => `m:${id}:${((await run(id)).waiting as ApprovalWaitPoint).approvalId}`;
    const notices = () => fixture.adapter.posts
        .map((post) => (post.message as { raw: string }).raw)
        .filter((text) => text === CHAT_ANSWER_NOTICE_SEVERAL || text === CHAT_ANSWER_NOTICE_CLOSED);

    /** a reply sent now on the engine's clock */
    const reply = (message: Parameters<typeof createTextMessage>[0]) => createTextMessage({ sentAt: new Date(fixture.clock.now()), ...message });

    return {
        fixture,
        state,
        reply,
        keys,
        ids,
        run,
        wait,
        assistantRuns,
        approvalId,
        notices,
    };
}

describe('answering approvals in chat intake', () => {
    it('approves the one open approval from a direct reply read as approve', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model });

        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes, go ahead' }));
        await ctx.fixture.engine.idle();

        expect((await ctx.run(ctx.ids[0]!)).status).not.toBe('waiting');
        expect((await ctx.wait(ctx.ids[0]!))?.output).toMatchObject({
            approved: true,
            reason: 'yes, go ahead',
            approver: { id: 'owner' },
        });
        expect(await ctx.assistantRuns()).toEqual([]);
        expect(model.doGenerateCalls).toHaveLength(1);

        // the classifier saw the title and the reply only
        const { prompt } = model.doGenerateCalls[0]!;

        expect(prompt).toHaveLength(2);
        expect(prompt[0]?.role).toBe('system');
        expect(prompt[1]).toMatchObject({ role: 'user', content: [{ type: 'text', text: 'Approval request: "deploy asker"\nReply: "yes, go ahead"' }] });
        expect(prompt[1]?.content).toHaveLength(1);
        expect(ctx.fixture.errors).toEqual([]);
    });

    it('denies from a reply read as deny', async () => {
        const ctx = await setup({ model: classifier('deny') });

        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'no' }));
        await ctx.fixture.engine.idle();

        expect((await ctx.wait(ctx.ids[0]!))?.output).toMatchObject({ approved: false, reason: 'no' });
        expect(await ctx.assistantRuns()).toEqual([]);
    });

    it('dispatches a reply read as unclear as a normal message', async () => {
        const ctx = await setup({ model: classifier('unclear') });

        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'what is the weather' }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
    });

    it('dispatches when the classifier fails', async () => {
        const ctx = await setup({ model: failingModel() });

        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(ctx.fixture.errors).toEqual([]);
    });

    it('dispatches when the answer model does not resolve', async () => {
        const ctx = await setup({ model: 'unknown-provider/some-model' });

        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(ctx.fixture.errors).toEqual([]);
    });

    it('leaves the approval to a sender without chamvi_agent_approve and asks no model', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model, invoker: runner });

        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(model.doGenerateCalls).toHaveLength(0);
    });

    it('never answers from a group message', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model });

        ctx.fixture.adapter.isDirect = () => false;
        await ctx.fixture.adapter.deliver(ctx.reply({
            id: 'r-1',
            text: 'yes',
            isMention: true,
        }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(model.doGenerateCalls).toHaveLength(0);
    });

    it('asks which approval when several are open and the reply quotes none', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model, askers: [asker('asker-a'), asker('asker-b')] });

        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));

        for (const id of ctx.ids) {
            expect((await ctx.run(id)).status).toBe('waiting');
        }

        expect(ctx.notices()).toEqual([CHAT_ANSWER_NOTICE_SEVERAL]);
        expect(ctx.keys).toContain(`answer:${hashKey(['fake', 'fake:chat-1', 'r-1'])}:several`);
        expect(await ctx.assistantRuns()).toEqual([]);
        expect(model.doGenerateCalls).toHaveLength(0);
    });

    it('dispatches a plain reply of a sender who may answer none of several', async () => {
        const ctx = await setup({
            model: classifier('approve'),
            invoker: runner,
            askers: [asker('asker-a'), asker('asker-b')],
        });

        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));

        expect(ctx.notices()).toEqual([]);
        expect(await ctx.assistantRuns()).toHaveLength(1);
    });

    it('answers the quoted approval of several', async () => {
        const ctx = await setup({ model: classifier('approve'), askers: [asker('asker-a'), asker('asker-b')] });

        await ctx.fixture.adapter.deliver(ctx.reply({
            id: 'r-1',
            text: 'yes',
            replyTo: await ctx.approvalId(ctx.ids[1]!),
        }));
        await ctx.fixture.engine.idle();

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect((await ctx.wait(ctx.ids[1]!))?.output).toMatchObject({ approved: true });
        expect(await ctx.assistantRuns()).toEqual([]);
    });

    it('answers one concurrent redelivery once', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model });
        const message = ctx.reply({ id: 'r-1', text: 'yes' });

        await Promise.all([ctx.fixture.adapter.deliver(message), ctx.fixture.adapter.deliver(message)]);
        await ctx.fixture.engine.idle();

        expect(model.doGenerateCalls).toHaveLength(1);
        expect((await ctx.wait(ctx.ids[0]!))?.output).toMatchObject({ approved: true });
        expect(await ctx.assistantRuns()).toEqual([]);
        expect(ctx.fixture.errors).toEqual([]);
    });

    it('tells a reply quoting an approval already answered that it is closed, under one key per message', async () => {
        const ctx = await setup({ model: classifier('approve') });
        const quoted = await ctx.approvalId(ctx.ids[0]!);

        await ctx.fixture.adapter.deliver(ctx.reply({
            id: 'r-1',
            text: 'yes',
            replyTo: quoted,
        }));
        await ctx.fixture.engine.idle();
        expect((await ctx.wait(ctx.ids[0]!))?.output).toMatchObject({ approved: true });

        const late = ctx.reply({
            id: 'r-2',
            text: 'yes',
            replyTo: quoted,
        });

        await ctx.fixture.adapter.deliver(late);
        await ctx.fixture.adapter.deliver(late);

        const key = `answer:${hashKey(['fake', 'fake:chat-1', 'r-2'])}:closed`;

        expect(ctx.notices()).toEqual([CHAT_ANSWER_NOTICE_CLOSED, CHAT_ANSWER_NOTICE_CLOSED]);
        expect(ctx.keys.filter((item) => item.startsWith('answer:'))).toEqual([key, key]);
        expect(await ctx.assistantRuns()).toEqual([]);
    });

    it('tells closed when the approval settled between the pick and the answer', async () => {
        const ctx = await setup({ model: classifier('approve') });

        ctx.fixture.engine.approve = async () => {
            throw new InvalidRunStateError('Run is not waiting.');
        };
        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));

        expect(ctx.notices()).toEqual([CHAT_ANSWER_NOTICE_CLOSED]);
        expect(await ctx.assistantRuns()).toEqual([]);
    });

    it('fails the intake on any other approve error', async () => {
        const ctx = await setup({ model: classifier('approve') });
        const failure = new Error('store down');

        ctx.fixture.engine.approve = async () => {
            throw failure;
        };

        await expect(ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }))).rejects.toBe(failure);
        await flush();
        expect(ctx.fixture.errors).toContain(failure);
        expect(await ctx.assistantRuns()).toEqual([]);
    });

    it('still handles the message when a notice fails to send', async () => {
        const ctx = await setup({ model: classifier('approve'), askers: [asker('asker-a'), asker('asker-b')] });

        ctx.fixture.adapter.postMessage = async () => {
            throw new Error('offline');
        };
        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));

        expect(ctx.fixture.errors).toHaveLength(1);
        expect(await ctx.assistantRuns()).toEqual([]);
    });

    it('never answers a trust-gate approval', async () => {
        const model = classifier('approve');
        const ctx = await setup({
            model,
            askers: [asker('gate', true)],
            patch: { approvalUrl: ({ runId }) => `https://chamvi.test/approvals/${runId}` },
        });

        expect(((await ctx.run(ctx.ids[0]!)).waiting as ApprovalWaitPoint).notification).toBeDefined();

        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(model.doGenerateCalls).toHaveLength(0);
    });

    it('changes nothing without answers', async () => {
        const ctx = await setup({ answers: false });

        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(ctx.notices()).toEqual([]);
    });

    it('answers one approval per reply: a later redelivery leaves the next approval waiting', async () => {
        const model = mockModel([
            { parts: [{ type: 'text', text: '{"decision":"approve"}' }] },
            { parts: [{ type: 'text', text: '{"decision":"approve"}' }] },
        ]);
        const ctx = await setup({ model, askers: [twiceAsker('asker')] });
        const id = ctx.ids[0]!;
        const first = ((await ctx.run(id)).waiting as ApprovalWaitPoint).approvalId;
        const message = ctx.reply({ id: 'r-1', text: 'yes' });

        await ctx.fixture.adapter.deliver(message);
        await ctx.fixture.engine.idle();
        await vi.waitFor(async () => {
            const waiting = (await ctx.run(id)).waiting as ApprovalWaitPoint | undefined;

            expect(waiting?.approvalId).toBeDefined();
            expect(waiting?.approvalId).not.toBe(first);
            expect(waiting?.notifiedAt).toBeDefined();
        });
        expect(((await ctx.run(id)).waiting as ApprovalWaitPoint).title).toBe('B');

        // the same reply again, after its in-flight entry is gone, with B the one open approval
        await ctx.fixture.adapter.deliver(message);
        await ctx.fixture.engine.idle();

        expect((await ctx.run(id)).status).toBe('waiting');
        expect(((await ctx.run(id)).waiting as ApprovalWaitPoint).title).toBe('B');
        // classified again (the claim is taken right before the answer), but answers nothing
        expect(model.doGenerateCalls).toHaveLength(2);
        expect(await ctx.assistantRuns()).toEqual([]);
    });

    it('dispatches a reply sent before its approval reached the chat', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model });
        const { notifiedAt } = (await ctx.run(ctx.ids[0]!)).waiting as ApprovalWaitPoint;

        await ctx.fixture.adapter.deliver(ctx.reply({
            id: 'r-1',
            text: 'yes',
            sentAt: new Date(new Date(notifiedAt!).getTime() - 1),
        }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(model.doGenerateCalls).toHaveLength(0);
    });

    it('dispatches a reply without a send time', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model });

        // an invalid date leaves the payload without sentAt
        await ctx.fixture.adapter.deliver(ctx.reply({
            id: 'r-1',
            text: 'yes',
            sentAt: new Date(NaN),
        }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(model.doGenerateCalls).toHaveLength(0);
    });

    it('never answers an approval whose message was not delivered', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model, failing: true });
        const id = ctx.ids[0]!;

        expect(((await ctx.run(id)).waiting as ApprovalWaitPoint).notifiedAt).toBeUndefined();

        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));

        expect((await ctx.run(id)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(model.doGenerateCalls).toHaveLength(0);

        // a later tick delivers it: from then on it is answerable
        ctx.state.failing = false;
        await vi.waitFor(async () => {
            await ctx.fixture.engine.tick();
            expect(((await ctx.run(id)).waiting as ApprovalWaitPoint).notifiedAt).toBeDefined();
        });
        await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-2', text: 'yes' }));
        await ctx.fixture.engine.idle();

        expect((await ctx.wait(id))?.output).toMatchObject({ approved: true });
    });

    it('dispatches a reply whose quote names no message id', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model });

        await ctx.fixture.adapter.deliver(ctx.reply({
            id: 'r-1',
            text: 'yes',
            replyTo: 'x'.repeat(2000),
        }));
        await ctx.fixture.adapter.deliver(ctx.reply({
            id: 'r-2',
            text: 'yes',
            replyTo: 'bad\0id',
        }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(2);
        expect(model.doGenerateCalls).toHaveLength(0);
    });

    it('dispatches a quoting reply on a platform that cannot match quotes', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model, patch: { platform: {} } });

        await ctx.fixture.adapter.deliver(ctx.reply({
            id: 'r-1',
            text: 'yes',
            replyTo: 'sent-1',
        }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(model.doGenerateCalls).toHaveLength(0);
    });

    it('dispatches a reply quoting some other message', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model });

        await ctx.fixture.adapter.deliver(ctx.reply({
            id: 'r-1',
            text: 'yes',
            replyTo: 'm:chatter',
        }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(model.doGenerateCalls).toHaveLength(0);
    });

    it('leaves a quoted approval to a sender without chamvi_agent_approve', async () => {
        const model = classifier('approve');
        const ctx = await setup({ model, invoker: runner });

        await ctx.fixture.adapter.deliver(ctx.reply({
            id: 'r-1',
            text: 'yes',
            replyTo: await ctx.approvalId(ctx.ids[0]!),
        }));

        expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
        expect(await ctx.assistantRuns()).toHaveLength(1);
        expect(model.doGenerateCalls).toHaveLength(0);
    });

    describe('a sender granted for non-private agents only', () => {
        const publicOnly: Invoker = {
            id: 'public',
            kind: 'chat',
            bindings: [
                { permission: { name: 'chamvi_agent_run' } },
                { permission: { name: 'chamvi_agent_approve' }, policies: [{ type: 'attributes', query: { private: false } } as never] },
            ],
        };

        it('answers for an agent the engine holds as non-private', async () => {
            const ctx = await setup({ model: classifier('approve'), invoker: publicOnly });

            await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));
            await ctx.fixture.engine.idle();

            expect((await ctx.wait(ctx.ids[0]!))?.output).toMatchObject({ approved: true });
        });

        it('fails closed for an agent the engine no longer holds', async () => {
            const model = classifier('approve');
            const ctx = await setup({ model, invoker: publicOnly });
            const { engine } = ctx.fixture;
            const getAgent = engine.getAgent.bind(engine);

            engine.getAgent = (name) => (name === 'asker' ? undefined : getAgent(name));
            await ctx.fixture.adapter.deliver(ctx.reply({ id: 'r-1', text: 'yes' }));

            expect((await ctx.run(ctx.ids[0]!)).status).toBe('waiting');
            expect(await ctx.assistantRuns()).toHaveLength(1);
            expect(model.doGenerateCalls).toHaveLength(0);
        });
    });
});
