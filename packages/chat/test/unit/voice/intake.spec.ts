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
    TimeoutError,
    ValidationError,
    defineModelAgent,
    defineTool,
} from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import type { ApprovalWaitPoint, Invoker } from '@chamvi/store';
import { chatAddress } from '@chamvi/chat';
import type {
    ChatAudioAttachment,
    ChatChannelOptions,
    ChatPayload,
    ChatVoiceOptions,
} from '@chamvi/chat';
import { inspect } from 'node:util';
import { mockModel, textModel } from '@chamvi/test-kit';
import type { Attachment } from 'chat';
import { createTextMessage } from '../../utils/adapter.ts';
import { createIntakeFixture, flush } from '../../utils/intake.ts';
import type { IntakeFixture } from '../../utils/intake.ts';
import { transcriptionModel } from '../../utils/model.ts';

const NOTICE_LONG = 'Voice message too long: at most 5 minutes.';
const NOTICE_UNCLEAR = 'I could not understand the voice message.';
const AUDIO = Buffer.from('ogg-bytes');

const owner: Invoker = {
    id: 'owner',
    kind: 'chat',
    bindings: [{ permission: { name: 'chamvi_agent_run' } }, { permission: { name: 'chamvi_agent_approve' } }],
};

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

type Note = {
    id: string;
    size?: number;
    durationSeconds?: number;
    /** what fetchData returns; default AUDIO */
    data?: Buffer;
    /** fetchData rejects with it */
    fetchError?: Error;
    /** no fetchData at all */
    unfetchable?: boolean;
    /** attachments after the audio one */
    extra?: Attachment[];
    sentAt?: Date;
};

/** A voice note (no text) whose downloads are counted in `fetches`. */
function voiceNote(note: Note, fetches: string[]) {
    const audio: ChatAudioAttachment = {
        type: 'audio',
        mimeType: 'audio/ogg',
        ...(note.size !== undefined ? { size: note.size } : {}),
        ...(note.durationSeconds !== undefined ? { durationSeconds: note.durationSeconds } : {}),
        ...(note.unfetchable ? {} : {
            fetchData: async () => {
                fetches.push(note.id);

                if (note.fetchError) {
                    throw note.fetchError;
                }

                return note.data ?? AUDIO;
            },
        }),
    };

    return createTextMessage({
        id: note.id,
        text: '',
        attachments: [audio, ...(note.extra ?? [])],
        ...(note.sentAt ? { sentAt: note.sentAt } : {}),
    });
}

type Setup = {
    model?: ReturnType<typeof transcriptionModel>;
    voice?: Partial<ChatVoiceOptions> | false;
    patch?: Partial<ChatChannelOptions>;
};

async function setup(input: Setup = {}) {
    const model = input.model ?? transcriptionModel('Was steht heute an?');
    const fixture: IntakeFixture = createIntakeFixture({
        agents: (channel) => [defineModelAgent({
            name: 'assistant',
            model: textModel(),
            instructions: 'Answer.',
            channels: [channel.on()],
        })],
        patch: {
            ...(input.voice === false ? {} : { voice: { model, ...input.voice } }),
            ...input.patch,
        },
    });

    engines.push(fixture.engine);
    await fixture.engine.start();

    const fetches: string[] = [];
    const posted = () => fixture.adapter.posts.map((post) => (post.message as { raw: string }).raw);

    return {
        fixture,
        model,
        fetches,
        posted,
        note: (note: Note) => voiceNote(note, fetches),
    };
}

describe('voice messages in chat intake', () => {
    it('transcribes a voice note and dispatches the labelled text', async () => {
        const ctx = await setup();

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1', durationSeconds: 4 }));

        const runs = await ctx.fixture.runs();

        expect(runs).toHaveLength(1);

        const payload = runs[0]!.trigger.payload as ChatPayload;

        expect(payload.message.text).toBe('[Voice message] Was steht heute an?');
        expect(payload.voice).toEqual({
            mediaType: 'audio/ogg',
            bytes: AUDIO.byteLength,
            seconds: 4,
        });
        expect(ctx.fetches).toEqual(['v-1']);
        expect(ctx.model.calls).toHaveLength(1);
        expect(Buffer.from(ctx.model.calls[0]!.audio as Uint8Array).equals(AUDIO)).toBe(true);
        // the bytes are never stored
        expect(JSON.stringify(runs)).not.toContain('ogg-bytes');
        expect(ctx.posted()).toEqual([]);
        expect(ctx.fixture.errors).toEqual([]);
    });

    it('downloads nothing for a message the policy refuses', async () => {
        const resolveInvoker = vi.fn(() => undefined);
        const ctx = await setup({ patch: { allowMessage: () => false, resolveInvoker } });

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1' }));

        expect(ctx.fetches).toEqual([]);
        expect(ctx.model.calls).toEqual([]);
        expect(resolveInvoker).not.toHaveBeenCalled();
        expect(await ctx.fixture.runs()).toEqual([]);
        expect(ctx.posted()).toEqual([]);
    });

    it('transcribes only after resolveInvoker ran', async () => {
        const order: string[] = [];
        const model = transcriptionModel('hallo');
        const ctx = await setup({
            model,
            patch: {
                resolveInvoker: () => {
                    order.push(`invoker:${model.calls.length}`);

                    return undefined;
                },
            },
        });

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1' }));

        expect(order).toEqual(['invoker:0']);
        expect(ctx.fetches).toEqual(['v-1']);
        expect(await ctx.fixture.runs()).toHaveLength(1);
    });

    it('refuses audio without voice as today', async () => {
        const ctx = await setup({ voice: false });

        await expect(ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1' }))).rejects.toThrow(/attachments are not supported/);
        expect(ctx.fixture.errors).toEqual([expect.any(ValidationError)]);
        expect(ctx.fetches).toEqual([]);
        expect(await ctx.fixture.runs()).toEqual([]);
    });

    it('refuses audio the platform cannot fetch as today', async () => {
        const ctx = await setup();

        await expect(ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1', unfetchable: true }))).rejects.toThrow(/attachments are not supported/);
        expect(ctx.model.calls).toEqual([]);
        expect(ctx.posted()).toEqual([]);
    });

    it.each([
        ['two voice notes', { type: 'audio', mimeType: 'audio/ogg' }],
        ['audio with an image', { type: 'image', mimeType: 'image/jpeg' }],
    ] as const)('refuses %s', async (_name, extra) => {
        const ctx = await setup();

        const error = await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1', extra: [{ ...extra }] })).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ValidationError);
        expect((error as Error).message).toMatch(/attachments are not supported/);
        expect(ctx.fetches).toEqual([]);
        expect(ctx.model.calls).toEqual([]);
        expect(await ctx.fixture.runs()).toEqual([]);
    });

    it('sends the too-long notice above maxSeconds without downloading', async () => {
        const ctx = await setup();

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1', durationSeconds: 301 }));

        expect(ctx.posted()).toEqual([NOTICE_LONG]);
        expect(ctx.fetches).toEqual([]);
        expect(ctx.model.calls).toEqual([]);
        expect(await ctx.fixture.runs()).toEqual([]);
        expect(ctx.fixture.errors).toEqual([expect.any(ValidationError)]);
        expect((ctx.fixture.errors[0] as Error).message).toMatch(/longer than 300s/);
        expect((ctx.fixture.errors[0] as Error).message).not.toMatch(/bytes/);
    });

    it.each([
        [59, 'Voice message too long: at most 1 minute.'],
        [119, 'Voice message too long: at most 1 minute.'],
        [120, 'Voice message too long: at most 2 minutes.'],
    ])('names the whole minutes of maxSeconds %i, at least one', async (maxSeconds, notice) => {
        const ctx = await setup({ voice: { maxSeconds } });

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1', durationSeconds: maxSeconds + 1 }));

        expect(ctx.posted()).toEqual([notice]);
    });

    it('refuses above maxBytes by reported size without downloading', async () => {
        const ctx = await setup({ voice: { maxBytes: 16 } });

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1', size: 17 }));

        expect(ctx.posted()).toEqual([NOTICE_LONG]);
        expect((ctx.fixture.errors[0] as Error).message).toMatch(/larger than 16 bytes/);
        expect((ctx.fixture.errors[0] as Error).message).not.toMatch(/\d+s\b/);
        expect(ctx.fetches).toEqual([]);
        expect(ctx.model.calls).toEqual([]);
        expect(await ctx.fixture.runs()).toEqual([]);
    });

    it('discards a fetched body above maxBytes', async () => {
        const ctx = await setup({ voice: { maxBytes: 16 } });

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1', data: Buffer.alloc(17) }));

        expect(ctx.fetches).toEqual(['v-1']);
        expect(ctx.posted()).toEqual([NOTICE_UNCLEAR]);
        expect(ctx.model.calls).toEqual([]);
        expect(await ctx.fixture.runs()).toEqual([]);
        expect(ctx.fixture.errors).toEqual([expect.any(ValidationError)]);
    });

    it('sends the not-understood notice for an empty transcript', async () => {
        const ctx = await setup({ model: transcriptionModel('  ') });

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1' }));

        expect(ctx.posted()).toEqual([NOTICE_UNCLEAR]);
        expect(await ctx.fixture.runs()).toEqual([]);
        expect(ctx.fixture.errors).toEqual([expect.any(ValidationError)]);
    });

    it('sends the not-understood notice for a failing model', async () => {
        const failure = new Error('stt down');
        const ctx = await setup({ model: transcriptionModel(failure) });

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1' }));

        expect(ctx.posted()).toEqual([NOTICE_UNCLEAR]);
        expect(await ctx.fixture.runs()).toEqual([]);
        // one call: no retries on real timers
        expect(ctx.model.calls).toHaveLength(1);
        expect(ctx.fixture.errors).toEqual([expect.any(ValidationError)]);
        expect((ctx.fixture.errors[0] as Error).message).toContain('Error: stt down');
    });

    it('reports a model error without its request body', async () => {
        const failure = Object.assign(new Error('provider refused'), {
            name: 'AI_APICallError',
            requestBodyValues: { audio: 'secret-audio-base64' },
        });
        const ctx = await setup({ model: transcriptionModel(failure) });

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1' }));

        expect(ctx.posted()).toEqual([NOTICE_UNCLEAR]);
        expect(ctx.fixture.errors).toHaveLength(1);

        const [reported] = ctx.fixture.errors as [Error];

        expect(reported).toBeInstanceOf(ValidationError);
        expect(reported).not.toBe(failure);
        expect(reported.message).toContain('AI_APICallError: provider refused');
        expect(reported.cause).toBeUndefined();
        expect(JSON.stringify(reported)).not.toContain('secret-audio-base64');
        expect(inspect(reported, { depth: 10, showHidden: true })).not.toContain('secret-audio-base64');
        expect(inspect(reported, { depth: 10, showHidden: true })).not.toContain('requestBodyValues');
    });

    it('reports a failed download as a chamvi error', async () => {
        const failure = Object.assign(new Error('media gone'), { body: 'secret-audio-base64' });
        const ctx = await setup();

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1', fetchError: failure }));

        expect(ctx.posted()).toEqual([NOTICE_UNCLEAR]);
        expect(ctx.model.calls).toEqual([]);
        expect(ctx.fixture.errors).toEqual([expect.any(ValidationError)]);
        expect((ctx.fixture.errors[0] as Error).message).toContain('media gone');
        expect(inspect(ctx.fixture.errors[0], { depth: 10, showHidden: true })).not.toContain('secret-audio-base64');
        expect(await ctx.fixture.runs()).toEqual([]);
    });

    it('keys the notice per message', async () => {
        const keys: string[] = [];
        const ctx = await setup({
            voice: { maxSeconds: 60 },
            patch: {
                platform: {
                    prepare: (send) => {
                        keys.push(send.key);

                        return async () => undefined;
                    },
                },
            },
        });

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1', durationSeconds: 61 }));
        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-2', durationSeconds: 61 }));

        expect(keys).toHaveLength(2);
        expect(keys[0]).toMatch(/^voice:sha256:[0-9a-f]{64}:long$/);
        expect(keys[1]).not.toBe(keys[0]);
    });

    it('reports a failed notice and still starts no run', async () => {
        const failure = new Error('post failed');
        const ctx = await setup({
            patch: {
                platform: {
                    prepare: () => async () => {
                        throw failure;
                    },
                },
            },
        });

        await expect(ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1', durationSeconds: 301 }))).resolves.toBeUndefined();
        expect(await ctx.fixture.runs()).toEqual([]);
        expect(ctx.fixture.errors).toHaveLength(2);
    });

    it('aborts a hanging model after timeoutMs on the engine clock', async () => {
        const model = transcriptionModel('hang', 'Zweiter Versuch');
        const ctx = await setup({ model });

        const first = ctx.fixture.adapter.deliver(ctx.note({ id: 'v-1' }));

        await vi.waitFor(() => expect(model.calls).toHaveLength(1));
        ctx.fixture.clock.advance(59_999);
        await flush();
        expect(ctx.posted()).toEqual([]);

        ctx.fixture.clock.advance(1);
        await first;

        expect(model.calls[0]!.abortSignal?.aborted).toBe(true);
        expect(ctx.posted()).toEqual([NOTICE_UNCLEAR]);
        expect(ctx.fixture.errors).toEqual([expect.any(TimeoutError)]);
        expect(await ctx.fixture.runs()).toEqual([]);

        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-2' }));

        const runs = await ctx.fixture.runs();

        expect(runs).toHaveLength(1);
        expect((runs[0]!.trigger.payload as ChatPayload).message.text).toBe('[Voice message] Zweiter Versuch');
    });

    it('runs at most two transcriptions at once', async () => {
        const model = transcriptionModel('hang');
        const ctx = await setup({ model });

        const deliveries = ['v-1', 'v-2', 'v-3'].map((id) => ctx.fixture.adapter.deliver(ctx.note({ id })));

        await vi.waitFor(() => expect(model.calls).toHaveLength(2));
        await flush();
        await flush();
        expect(model.calls).toHaveLength(2);
        expect(ctx.fetches).toHaveLength(2);

        ctx.fixture.clock.advance(60_000);
        await vi.waitFor(() => expect(model.calls).toHaveLength(3));

        ctx.fixture.clock.advance(60_000);
        await Promise.all(deliveries);

        expect(ctx.posted()).toEqual([NOTICE_UNCLEAR, NOTICE_UNCLEAR, NOTICE_UNCLEAR]);
    });

    it('releases the slots and rethrows the stop reason when the channel stops', async () => {
        const model = transcriptionModel('hang', 'hang', 'nach dem Neustart');
        const ctx = await setup({ model });

        const deliveries = ['v-1', 'v-2', 'v-3'].map((id) => ctx.fixture.adapter.deliver(ctx.note({ id })).catch((caught: unknown) => caught));

        await vi.waitFor(() => expect(model.calls).toHaveLength(2));
        await flush();
        // v-3 waits for a slot
        expect(ctx.fetches).toEqual(['v-1', 'v-2']);

        await ctx.fixture.engine.stop();

        const outcomes = await Promise.all(deliveries);

        expect(outcomes).toEqual([
            expect.any(InvalidRunStateError),
            expect.any(InvalidRunStateError),
            expect.any(InvalidRunStateError),
        ]);
        expect(outcomes.every((outcome) => (outcome as Error).message.includes('stopped'))).toBe(true);
        expect(model.calls.every((call) => call.abortSignal?.aborted)).toBe(true);
        expect(ctx.fetches).toEqual(['v-1', 'v-2']);
        expect(ctx.posted()).toEqual([]);
        expect(await ctx.fixture.runs()).toEqual([]);

        // both slots are free again: a note after a restart is transcribed at once
        await ctx.fixture.engine.start();
        await ctx.fixture.adapter.deliver(ctx.note({ id: 'v-4' }));

        const runs = await ctx.fixture.runs();

        expect(runs).toHaveLength(1);
        expect((runs[0]!.trigger.payload as ChatPayload).message.text).toBe('[Voice message] nach dem Neustart');
    });

    it('a voice reply answers the single open approval', async () => {
        const address = chatAddress({ adapter: 'fake', threadId: 'fake:chat-1' });
        const ask = defineTool({
            inputSchema: z.object({ title: z.string() }),
            execute: async (input, { context }) => {
                const decision = await context.channels.findOneOrFail('chat').approve({ title: input.title, address });

                return decision.approved ? 'approved' : 'denied';
            },
        });
        const classifier = mockModel([{ parts: [{ type: 'text', text: JSON.stringify({ decision: 'approve' }) }] }]);
        const model = transcriptionModel('ja');
        const fixture = createIntakeFixture({
            agents: (channel) => [
                defineModelAgent({
                    name: 'asker',
                    instructions: 'Ask.',
                    model: mockModel([
                        {
                            parts: [{
                                type: 'tool-call',
                                toolName: 'ask',
                                input: { title: 'send the mail' },
                            }],
                        },
                        { parts: [{ type: 'text', text: 'done' }] },
                    ]),
                    tools: { ask },
                }),
                defineModelAgent({
                    name: 'assistant',
                    instructions: 'Answer.',
                    model: textModel(),
                    channels: [channel.on()],
                }),
            ],
            patch: {
                answers: { model: classifier },
                resolveInvoker: () => owner,
                voice: { model },
            },
        });

        engines.push(fixture.engine);
        await fixture.engine.start();

        const { runId } = await fixture.engine.dispatch({
            agent: 'asker',
            trigger: 'test',
            channel: 'chat',
            address,
            payload: {},
        });

        await vi.waitFor(async () => {
            const run = await fixture.engine.runService.findOne(runId);

            expect((run?.waiting as ApprovalWaitPoint | undefined)?.notifiedAt).toBeDefined();
        });
        fixture.clock.advance(1);

        await fixture.adapter.deliver(voiceNote({ id: 'v-1', sentAt: new Date(fixture.clock.now()) }, []));
        await fixture.engine.idle();

        const steps = await fixture.engine.stepService.find(runId);

        expect(steps.find((step) => step.kind === 'wait')?.output).toMatchObject({
            approved: true,
            reason: '[Voice message] ja',
        });
        expect((await fixture.runs()).filter((run) => run.agent === 'assistant')).toEqual([]);
        expect(JSON.stringify(classifier.doGenerateCalls[0]!.prompt)).toContain('[Voice message] ja');
    });
});
