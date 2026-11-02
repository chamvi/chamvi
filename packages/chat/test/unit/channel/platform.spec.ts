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
    expectTypeOf,
    it,
} from 'vitest';
import {
    InvalidAgentDefinitionError,
    ValidationError,
    defineAgent,
} from '@chamvi/core';
import type {
    Agent,
    ChannelMessage,
    ChannelSendOptions,
    ConversationTarget,
    IEngine,
    TriggerEnvelope,
} from '@chamvi/core';
import { CHAT_REQUEST_ERROR_CODE, chatAddress } from '@chamvi/chat';
import type {
    ChatChannel,
    ChatChannelOptions,
    ChatIncoming,
    ChatPayload,
    ChatPlatformSend,
    IChatPlatform,
} from '@chamvi/chat';
import { textModel } from '@chamvi/test-kit';
import { createTextMessage } from '../../utils/adapter.ts';
import { createIntakeFixture, flush } from '../../utils/intake.ts';
import type { IntakeFixture, IntakeFixtureInput } from '../../utils/intake.ts';

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

const SOURCE = chatAddress({ adapter: 'fake', threadId: 'fake:chat-1' });
const REFUSED = chatAddress({ adapter: 'fake', threadId: 'fake:refused' });

const TRIGGER: TriggerEnvelope = {
    id: 'trigger-1',
    agent: 'helper',
    trigger: 'chat',
    channel: 'chat',
    payload: {},
    receivedAt: new Date('2026-11-01T09:00:00Z'),
};

function message(patch: Partial<ChannelMessage> = {}): ChannelMessage {
    return {
        kind: 'message',
        key: 'run-1:emit:chat:key:greeting',
        runId: 'run-1',
        agent: 'helper',
        body: 'Hello there.',
        ...patch,
    };
}

function opts(): ChannelSendOptions {
    return { signal: new AbortController().signal, trigger: TRIGGER };
}

/**
 * A platform package's seam, as a class (so every hook must be called on the
 * platform itself): a transport that posts by itself, reports its connection
 * and names its own conversations.
 */
class FakePlatform implements IChatPlatform {
    connected = true;

    readonly trace: string[] = [];

    readonly prepared: ChatPlatformSend[] = [];

    readonly sent: ChatPlatformSend[] = [];

    readonly targets: Array<{ incoming: ChatIncoming; payload: ChatPayload }> = [];

    online(): boolean {
        this.trace.push('online');

        return this.connected;
    }

    prepare(input: ChatPlatformSend): () => Promise<unknown> {
        this.trace.push('prepare');

        if (input.threadId.endsWith(':refused')) {
            throw new ValidationError('this transport refuses that thread');
        }

        this.prepared.push(input);

        return async () => {
            this.sent.push(input);
        };
    }

    conversationTarget(incoming: ChatIncoming, payload: ChatPayload): ConversationTarget | undefined {
        this.trace.push('conversationTarget');
        this.targets.push({ incoming, payload });

        return {
            account: 'platform-account',
            chat: payload.threadId,
            audience: `room:${payload.channelId}`,
            text: payload.message.text,
        };
    }
}

function remembering(channel: ChatChannel): Agent {
    return defineAgent({
        name: 'remembering',
        model: textModel(),
        instructions: 'Answer.',
        conversation: true,
        channels: [channel.on()],
    });
}

async function started(input: IntakeFixtureInput): Promise<IntakeFixture> {
    const fixture = createIntakeFixture(input);

    engines.push(fixture.engine);
    await fixture.engine.start();

    return fixture;
}

describe('chatChannel({ platform })', () => {
    it('types the seam publicly', () => {
        expectTypeOf<ChatChannelOptions['platform']>().toEqualTypeOf<IChatPlatform | undefined>();
        expectTypeOf<ChatPlatformSend>().toEqualTypeOf<{
            adapter: string;
            threadId: string;
            text: string;
            key: string;
        }>();
    });

    it('sends through the platform\'s prepare, with the message key, never the adapter\'s postMessage', async () => {
        const platform = new FakePlatform();
        const fixture = await started({ agents: () => [], patch: { platform } });

        await fixture.channel.out!(message(), SOURCE, opts());

        expect(platform.sent).toEqual([{
            adapter: 'fake',
            threadId: 'fake:chat-1',
            text: 'Hello there.',
            key: 'run-1:emit:chat:key:greeting',
        }]);
        expect(fixture.adapter.posts).toEqual([]);
        // prepare first, then the online check
        expect(platform.trace).toEqual(['prepare', 'online']);
    });

    it('sends nothing while the platform reports itself offline', async () => {
        const platform = new FakePlatform();
        const fixture = await started({ agents: () => [], patch: { platform } });

        platform.connected = false;

        const error = await fixture.channel.out!(message(), SOURCE, opts()).catch((caught: unknown) => caught);

        expect((error as { code?: string }).code).toBe(CHAT_REQUEST_ERROR_CODE);
        expect(platform.prepared).toHaveLength(1);
        expect(platform.sent).toEqual([]);
        expect(fixture.adapter.posts).toEqual([]);

        platform.connected = true;
        await fixture.channel.out!(message(), SOURCE, opts());

        expect(platform.sent).toHaveLength(1);
    });

    it('sends nothing before the channel started, whatever the platform reports', async () => {
        const platform = new FakePlatform();
        const fixture = createIntakeFixture({ agents: () => [], patch: { platform } });

        const error = await fixture.channel.out!(message(), SOURCE, opts()).catch((caught: unknown) => caught);

        expect((error as { code?: string }).code).toBe(CHAT_REQUEST_ERROR_CODE);
        expect(platform.sent).toEqual([]);
    });

    it('passes the error of a refused target as is, before the online check', async () => {
        const platform = new FakePlatform();
        const fixture = await started({ agents: () => [], patch: { platform } });

        platform.connected = false;

        await expect(fixture.channel.out!(message(), REFUSED, opts())).rejects.toThrow(ValidationError);
        expect(platform.trace).toEqual(['prepare']);
        expect(platform.sent).toEqual([]);
    });

    it('names the conversation of a bound agent, after allowMessage and resolveInvoker', async () => {
        const platform = new FakePlatform();
        const fixture = await started({
            agents: (channel) => [remembering(channel)],
            patch: {
                platform,
                allowMessage: () => {
                    platform.trace.push('allowMessage');

                    return true;
                },
                resolveInvoker: () => {
                    platform.trace.push('resolveInvoker');

                    return undefined;
                },
            },
        });

        await fixture.adapter.deliver(createTextMessage({ id: 'm-1', text: 'hello there' }));
        await fixture.engine.idle();

        const [run] = await fixture.runs();

        expect(platform.trace).toEqual(['allowMessage', 'resolveInvoker', 'conversationTarget']);
        expect(platform.targets).toHaveLength(1);
        expect(platform.targets[0]?.incoming.threadId).toBe('fake:chat-1');
        expect(platform.targets[0]?.payload).toEqual(run?.trigger.payload);
        expect(run?.conversation?.scope.identity).toEqual({
            agent: 'remembering',
            channel: 'chat',
            account: 'platform-account',
            chat: 'fake:chat-1',
            audience: 'room:fake:chat-1',
        });
        expect(fixture.errors).toEqual([]);
    });

    it('asks for no conversation of a message allowMessage refused', async () => {
        const platform = new FakePlatform();
        const fixture = await started({
            agents: (channel) => [remembering(channel)],
            patch: { platform, allowMessage: () => false },
        });

        await fixture.adapter.deliver(createTextMessage({ id: 'm-1' }));
        await flush();

        expect(platform.trace).toEqual([]);
        expect(await fixture.runs()).toEqual([]);
    });

    it('takes a platform with some hooks only: the others keep their defaults', async () => {
        const fixture = await started({
            agents: (channel) => [remembering(channel)],
            patch: { platform: { online: () => true } },
        });

        await fixture.adapter.deliver(createTextMessage({ id: 'm-1' }));
        await fixture.engine.idle();
        await fixture.channel.out!(message(), SOURCE, opts());

        const [run] = await fixture.runs();

        expect(run?.conversation?.scope.identity).toEqual(expect.objectContaining({
            account: 'fake',
            audience: 'direct:user-1',
        }));
        expect(fixture.adapter.posts).toEqual([{ threadId: 'fake:chat-1', message: { raw: 'Hello there.' } }]);
    });

    it('refuses a platform that is no object of functions', () => {
        for (const platform of ['whatsapp', [], { online: true }, { prepare: 'post' }, { conversationTarget: {} }]) {
            expect(() => createIntakeFixture({
                agents: () => [],
                patch: { platform: platform as never },
            }), JSON.stringify(platform)).toThrow(InvalidAgentDefinitionError);
        }
    });
});
