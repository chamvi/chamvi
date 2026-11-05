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
import type {
    ChannelSubscription,
    ConversationAccess,
    ConversationRef,
    IChannel,
} from '@chamvi/core';
import {
    Engine,
    InvalidAgentDefinitionError,
    MemoryConversationRepository,
    ValidationError,
    createMemoryStore,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import {
    assertSchedulable,
    cron,
    cronChannel,
    fireCronSubscription,
    readCronOptions,
    runJob,
} from '@chamvi/channel-cron';
import { ControllableClock } from '@chamvi/test-kit';
import { createScheduler } from '../../../src/scheduler/module.ts';
import { mockModel } from '../../utils/model.ts';
import type { MockResponse } from '../../utils/model.ts';

const T = new Date('2026-03-01T07:00:00.000Z');
const T_ISO = T.toISOString();
const ref: ConversationRef = {
    channel: 'chat',
    account: 'main',
    chat: 'dm-1',
    audience: 'direct:u-1',
    address: 'dm-1',
};
const TEXT = 'Write my morning briefing.';
const done: MockResponse = { parts: [{ type: 'text', text: 'done' }] };
const call = (toolName: string, input: unknown = {}): MockResponse => ({
    parts: [{
        type: 'tool-call',
        toolName,
        input,
    }],
});

const engines: Engine[] = [];

afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.stop()));
    vi.useRealTimers();
});

type SetupOptions = {
    responses?: MockResponse[];
    subscription?: ChannelSubscription;
    authorize?: (access: ConversationAccess) => boolean;
    conversation?: boolean;
    channels?: 'all' | 'cron';
    clock?: ControllableClock | false;
};

function setup(opts: SetupOptions = {}) {
    const clock = opts.clock === false ? undefined : (opts.clock ?? new ControllableClock(T));
    const store = createMemoryStore({ clock });
    const conversations = new MemoryConversationRepository({ clock });
    const out = vi.fn<NonNullable<IChannel['out']>>(async () => {});
    const chat: IChannel = {
        name: 'chat',
        in: async () => new Response(null, { status: 204 }),
        out,
    };
    const subscription = opts.subscription ?? cron.on('0 7 * * *', {
        id: 'briefing',
        timezone: 'UTC',
        conversation: ref,
        text: TEXT,
    });
    const model = mockModel(opts.responses ?? [done]);
    const agent = defineModelAgent({
        name: 'briefer',
        instructions: 'brief',
        model,
        ...(opts.conversation === false ? {} : { conversation: true }),
        channels: [subscription],
        tools: {
            read_mail: defineTool({
                inputSchema: z.object({}),
                trust: { taint: true },
                execute: async () => 'mail from outside',
            }),
            send: defineTool({
                inputSchema: z.object({ body: z.string(), to: z.string().optional() }),
                execute: async ({ body, to }, { context }) => {
                    await context.channels.findOneOrFail('chat').emit({ body }, to);

                    return 'sent';
                },
            }),
        },
    });
    const authorize = vi.fn(opts.authorize ?? (() => true));
    const errors: unknown[] = [];
    const engine = new Engine({
        store: { ...store, conversations },
        agents: [agent],
        channels: opts.channels === 'cron' ? [cronChannel()] : [cronChannel(), chat],
        conversations: { authorize },
        onError: (e) => {
            errors.push(e);
        },
        ...(clock ? { clock } : {}),
    });

    engines.push(engine);

    const fire = (scheduledAt: Date = T) => fireCronSubscription({
        engine,
        agent,
        subscription,
        scheduledAt,
    });

    return {
        clock,
        store,
        conversations,
        chat,
        out,
        model,
        agent,
        engine,
        authorize,
        errors,
        subscription,
        fire,
    };
}

async function runOf(s: ReturnType<typeof setup>, runId: string) {
    const run = await s.store.runs.findOne(runId);

    if (!run) {
        throw new Error('run missing');
    }

    return run;
}

describe('fireCronSubscription with a conversation', () => {
    it('starts the run inside the conversation through the channel intake', async () => {
        const s = setup();
        const result = await s.fire();

        expect(result).toMatchObject({ dispatched: true, deduplicated: false });

        if (!result.dispatched) {
            throw new Error('not dispatched');
        }

        const run = await runOf(s, result.runId);
        const identity = {
            agent: 'briefer',
            channel: 'chat',
            account: 'main',
            chat: 'dm-1',
            audience: 'direct:u-1',
        };

        expect(run.trigger).toMatchObject({
            agent: 'briefer',
            trigger: 'briefing',
            channel: 'chat',
            address: 'dm-1',
            payload: { scheduledAt: T_ISO },
            idempotencyKey: `briefing@${T_ISO}`,
        });
        expect(run.trigger.invoker).toBeUndefined();
        expect(run.address).toBe('dm-1');
        expect(run.conversation).toMatchObject({ text: TEXT, scope: { identity } });
        expect(await s.conversations.findOne(identity)).toMatchObject({ id: run.conversation?.scope.id, identity });
        // the conversation's concurrency key, never the subscription id
        expect(run.concurrencyKey).toBeDefined();
        expect(run.concurrencyKey).not.toBe('briefing');
        expect(s.authorize).toHaveBeenCalledWith({
            agent: 'briefer',
            operation: 'dispatch',
            identity,
        });
    });

    it('uses the subscription payload', async () => {
        const s = setup({
            subscription: cron.on('0 7 * * *', {
                id: 'briefing',
                payload: { task: 'morning' },
                conversation: ref,
                text: TEXT,
            }),
        });
        const result = await s.fire();

        expect(result.dispatched && (await runOf(s, result.runId)).trigger.payload).toEqual({ task: 'morning' });
    });

    it('sends to its source address without an approval, and waits for another address', async () => {
        const s = setup({ responses: [call('read_mail'), call('send', { body: 'Your briefing' }), done] });
        const first = await s.fire();

        await s.engine.start({ channels: false });
        await s.engine.idle();

        expect(first.dispatched).toBe(true);

        if (!first.dispatched) {
            return;
        }

        const run = await runOf(s, first.runId);

        expect(run.taint?.source).toBe('tool:read_mail');
        expect(run.status).toBe('completed');
        expect(s.out).toHaveBeenCalledTimes(1);
        expect(s.out.mock.calls[0]?.[1]).toBe('dm-1');
        expect(s.out.mock.calls[0]?.[0]).toMatchObject({ body: 'Your briefing' });

        const other = setup({ responses: [call('read_mail'), call('send', { body: 'Your briefing', to: 'someone-else' }), done] });
        const second = await other.fire();

        await other.engine.start({ channels: false });
        await other.engine.idle();

        if (!second.dispatched) {
            throw new Error('not dispatched');
        }

        const waiting = await runOf(other, second.runId);

        expect(waiting.status).toBe('waiting');
        expect(waiting.waiting?.kind).toBe('approval');
        expect(other.out.mock.calls.every(([message]) => message.kind !== 'message' || message.body !== 'Your briefing')).toBe(true);
    });

    it('deduplicates a second firing of the same tick', async () => {
        const s = setup({
            subscription: cron.on('0 7 * * *', {
                id: 'briefing',
                overlap: 'allow',
                conversation: ref,
                text: TEXT,
            }),
        });
        const first = await s.fire();
        const again = await s.fire();

        expect(first).toMatchObject({ dispatched: true, deduplicated: false });
        expect(again).toEqual({ ...first, deduplicated: true });
        expect((await s.store.runs.find({ agent: 'briefer' })).data).toHaveLength(1);
    });

    it('skips a tick while the previous run of the subscription is active', async () => {
        const s = setup();

        expect(await s.fire()).toMatchObject({ dispatched: true });
        expect(await s.fire()).toEqual({ dispatched: false, reason: 'overlap' });
        expect(await s.fire(new Date('2026-03-02T07:00:00.000Z'))).toEqual({ dispatched: false, reason: 'overlap' });
        expect((await s.store.runs.find({ agent: 'briefer' })).data).toHaveLength(1);
    });

    it('lets the authorizer refuse the cron dispatch: no run', async () => {
        const s = setup({ authorize: () => false });

        await expect(s.fire()).rejects.toBeInstanceOf(ValidationError);
        expect((await s.store.runs.find({ agent: 'briefer' })).data).toHaveLength(0);
    });

    it('reports a refused dispatch to the scheduler onError', async () => {
        vi.useFakeTimers({ now: new Date('2026-03-01T06:59:30Z') });

        const s = setup({ authorize: () => false, clock: false });
        const onError = vi.fn();
        const scheduler = createScheduler({
            engine: s.engine,
            channel: 'cron',
            onError,
        });

        await scheduler.start();

        try {
            await vi.advanceTimersByTimeAsync(60_000);
            expect(onError).toHaveBeenCalledWith(expect.any(ValidationError), { agent: 'briefer', subscription: 'briefing' });
            expect((await s.store.runs.find({ agent: 'briefer' })).data).toHaveLength(0);
        } finally {
            await scheduler.stop();
        }
    });

    it('recalls the cron text and the sent reply in the next run of the conversation', async () => {
        const s = setup({
            responses: [
                call('send', { body: 'Three meetings today.' }),
                done,
                { parts: [{ type: 'text', text: 'You have three.' }] },
            ],
        });

        await s.fire();
        await s.engine.start({ channels: false });
        await s.engine.idle();

        const target = {
            account: ref.account,
            chat: ref.chat,
            audience: ref.audience,
        };
        const next = await s.engine.channelContext(s.chat).dispatchConversation({
            agent: 'briefer',
            trigger: 'message',
            payload: 'how many meetings?',
            address: 'dm-1',
        }, { ...target, text: 'how many meetings?' });

        await s.engine.idle();

        expect((await runOf(s, next.runId)).status).toBe('completed');

        const prompt = s.model.doStreamCalls[2]?.prompt ?? [];
        const recalled = prompt.map((message) => ({ role: message.role, text: JSON.stringify(message.content) }));
        const user = recalled.findIndex((m) => m.role === 'user' && m.text.includes(TEXT));
        const assistant = recalled.findIndex((m) => m.role === 'assistant' && m.text.includes('Three meetings today.'));
        const current = recalled.findIndex((m) => m.role === 'user' && m.text.includes('how many meetings?'));

        expect(user).toBeGreaterThanOrEqual(0);
        expect(assistant).toBeGreaterThan(user);
        expect(current).toBeGreaterThan(assistant);
    });

    it('answers a channel the engine does not hold with reason channel', async () => {
        const s = setup({ channels: 'cron' });

        expect(await s.fire()).toEqual({ dispatched: false, reason: 'channel' });
        expect((await s.store.runs.find({ agent: 'briefer' })).data).toHaveLength(0);
    });

    it('refuses to schedule a conversation on a channel the engine does not hold', async () => {
        const s = setup({ channels: 'cron' });

        await expect(s.engine.start()).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
    });

    it('refuses an agent without conversations', async () => {
        const s = setup({ conversation: false });

        expect(() => readCronOptions(s.agent, s.subscription)).toThrow(InvalidAgentDefinitionError);
        expect(() => assertSchedulable(s.agent)).toThrow(InvalidAgentDefinitionError);
        await expect(s.engine.start()).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
    });

    it('runJob starts the run inside the conversation', async () => {
        const s = setup({ responses: [call('send', { body: 'Briefing' }), done] });
        const result = await runJob({ engine: s.engine, agent: s.agent });

        expect(result).toMatchObject({ status: 'completed', exitCode: 0 });

        const run = await runOf(s, result.runId!);

        expect(run.conversation?.text).toBe(TEXT);
        expect(run.trigger.channel).toBe('chat');
        expect(s.out.mock.calls[0]?.[1]).toBe('dm-1');
    });

    it('runJob refuses a conversation on a channel the engine does not hold', async () => {
        const s = setup({ channels: 'cron' });

        await expect(runJob({ engine: s.engine, agent: s.agent })).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
        expect((await s.store.runs.find({ agent: 'briefer' })).data).toHaveLength(0);
    });
});
