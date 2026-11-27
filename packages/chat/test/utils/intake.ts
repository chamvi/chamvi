/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { Chat } from 'chat';
import type {
    Agent,
    ConversationAccess,
    Engine,
    IModelResolver,
    IRunService,
} from '@chamvi/core';
import type { Run } from '@chamvi/core-kit';
import { chatChannel, createChatIngressAdapter } from '@chamvi/chat';
import type { ChatChannel, ChatChannelOptions, ChatIngress } from '@chamvi/chat';
import { ControllableClock, createTestEngine } from '@chamvi/test-kit';
import { createFakeAdapter } from './adapter.ts';
import type { FakeAdapter } from './adapter.ts';
import { createMemoryState, createRecordingLogger } from './chat.ts';

export type IntakeFixture = {
    /** the first adapter */
    adapter: FakeAdapter;
    ingress: ChatIngress;
    /** every adapter, in the order of `adapterNames` */
    adapters: FakeAdapter[];
    chat: Chat;
    clock: ControllableClock;
    engine: Engine;
    channel: ChatChannel;
    /** what the channel's onError got */
    errors: unknown[];
    /** what the engine's onError got */
    engineErrors: unknown[];
    /** the conversation authorize calls */
    access: ConversationAccess[];
    runs(): Promise<Run[]>;
};

export type IntakeFixtureInput = {
    agents: (channel: ChatChannel) => Agent[];
    patch?: Partial<ChatChannelOptions>;
    /** replaces the run service's create (a recording or failing wrapper around it) */
    create?: (create: IRunService['create']) => IRunService['create'];
    /** the conversation policy; default allow */
    authorize?: (access: ConversationAccess) => boolean | Promise<boolean>;
    /** the adapters' names; default one adapter `fake` */
    adapterNames?: string[];
    /** another fixture's engine whose store and clock this one shares (a replica) */
    replicaOf?: Engine;
    /** the engine's model resolver; none by default */
    models?: IModelResolver;
};

/** A chat channel with the real intake over the fake adapter, on an Engine with a memory store (conversations included). */
export function createIntakeFixture(input: IntakeFixtureInput): IntakeFixture {
    const clock = input.replicaOf ? input.replicaOf.clock as ControllableClock : new ControllableClock(new Date('2026-11-01T09:00:00Z'));
    const adapters = (input.adapterNames ?? ['fake']).map((name) => createFakeAdapter(name));
    const ingresses = adapters.map((item) => createChatIngressAdapter(item));
    const [adapter] = adapters as [FakeAdapter];
    const [ingress] = ingresses as [ChatIngress];
    const chat = new Chat({
        userName: 'chamvi',
        adapters: Object.fromEntries(ingresses.map((item) => [item.name, item])),
        state: createMemoryState(),
        logger: createRecordingLogger(),
        concurrency: 'concurrent',
    });
    const errors: unknown[] = [];
    const engineErrors: unknown[] = [];
    const access: ConversationAccess[] = [];
    const options: ChatChannelOptions = {
        chat,
        adapters: ingresses,
        allowMessage: () => true,
        onError: (error) => {
            errors.push(error);
        },
        ...input.patch,
    };
    const channel = chatChannel(options);
    const engine = createTestEngine({
        agents: input.agents(channel),
        channels: [channel],
        clock,
        ...(input.replicaOf ? { replicaOf: input.replicaOf } : {}),
        ...(input.models ? { models: input.models } : {}),
        conversations: {
            authorize: (item) => {
                access.push(item);

                return input.authorize ? input.authorize(item) : true;
            },
        },
        onError: (error) => {
            engineErrors.push(error);
        },
    });

    if (input.create) {
        engine.runService.create = input.create(engine.runService.create.bind(engine.runService));
    }

    return {
        adapter,
        ingress,
        adapters,
        chat,
        clock,
        engine,
        channel,
        errors,
        engineErrors,
        access,
        runs: async () => (await engine.runService.find({})).data,
    };
}

/** lets queued promise work run (no timers) */
export function flush(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}
