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
import { MockTranscriptionModelV4 } from 'ai/test';
import type { WAMessage } from 'baileys';
import type { ChatInstance, Message } from 'chat';
import type { IEngine } from '@chamvi/core';
import type { ChatAudioAttachment, ChatPayload } from '@chamvi/chat';
import { ControllableClock } from '@chamvi/test-kit';
import { createWhatsAppAdapter } from '../../../src/whatsapp/adapter.ts';
import type { WhatsAppAdapter, WhatsAppSocket } from '../../../src/whatsapp/types.ts';
import { createRecordingAuth } from '../../utils/auth.ts';
import {
    ALICE,
    MALLORY,
    createFakeSockets,
    createWhatsAppFixture,
    settle,
    waMessage,
} from '../../utils/whatsapp.ts';

const AUDIO = new Uint8Array([1, 2, 3, 4]);

const adapters: WhatsAppAdapter[] = [];
const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(adapters.map((adapter) => adapter.connection.close()));
    await Promise.all(engines.map((engine) => engine.stop()));
    adapters.length = 0;
    engines.length = 0;
});

let sequence = 0;

/** An incoming WhatsApp voice note (push to talk) of a direct chat. */
function voiceNote(chat: string): WAMessage {
    sequence += 1;

    return {
        key: {
            remoteJid: chat,
            fromMe: false,
            id: `VOICE${sequence}`,
        },
        message: {
            audioMessage: {
                ptt: true,
                mimetype: 'audio/ogg; codecs=opus',
                fileLength: 5120,
                seconds: 4,
            },
        },
        messageTimestamp: 1_793_000_000,
    };
}

/** A downloadMedia seam recording every call. */
function recordingDownload() {
    const calls: Array<{ message: WAMessage; socket: WhatsAppSocket }> = [];
    const download = async (message: WAMessage, socket: WhatsAppSocket): Promise<Uint8Array> => {
        calls.push({ message, socket });

        return AUDIO;
    };

    return { calls, download };
}

/** An adapter over a fake socket whose messages land in `received`. */
async function connected(downloadMedia: (message: WAMessage, socket: WhatsAppSocket) => Promise<Uint8Array>) {
    const sockets = createFakeSockets();
    const received: Message[] = [];
    const adapter = createWhatsAppAdapter({
        account: 'support',
        userName: 'chamvi',
        auth: createRecordingAuth().provider,
        socketFactory: sockets.factory,
        downloadMedia,
        onPairing: () => undefined,
        onError: (error) => {
            throw error;
        },
    });

    adapters.push(adapter);
    await adapter.initialize({
        processMessage: async (_adapter: unknown, _threadId: string, message: Message) => {
            received.push(message);
        },
    } as unknown as ChatInstance);
    await adapter.connection.connect({ signal: new AbortController().signal, clock: new ControllableClock(new Date('2026-11-01T09:00:00Z')) });

    const socket = sockets.last();

    socket.open();

    return { socket, received };
}

describe('WhatsApp voice notes', () => {
    it('lists a voice note as one audio attachment with size and duration', async () => {
        const { download } = recordingDownload();
        const { socket, received } = await connected(download);

        socket.deliver(voiceNote(ALICE));
        await settle();

        const attachments = received[0]?.attachments as ChatAudioAttachment[];

        expect(attachments).toHaveLength(1);
        expect(attachments[0]).toMatchObject({
            type: 'audio',
            mimeType: 'audio/ogg; codecs=opus',
            size: 5120,
            durationSeconds: 4,
        });
        expect(typeof attachments[0]?.fetchData).toBe('function');
    });

    it('reads a Long fileLength as a number', async () => {
        const { download } = recordingDownload();
        const { socket, received } = await connected(download);
        const raw = voiceNote(ALICE);

        raw.message!.audioMessage!.fileLength = {
            low: 5120, 
            high: 0, 
            unsigned: true, 
            toNumber: () => 5120, 
        } as never;
        socket.deliver(raw);
        await settle();

        expect(received[0]?.attachments[0]?.size).toBe(5120);
    });

    it('fetchData downloads through downloadMedia once called, never before', async () => {
        const { calls, download } = recordingDownload();
        const { socket, received } = await connected(download);
        const raw = voiceNote(ALICE);

        socket.deliver(raw);
        await settle();

        expect(calls).toHaveLength(0);

        const data = await received[0]!.attachments[0]!.fetchData!();

        expect(new Uint8Array(data as ArrayBufferLike)).toEqual(AUDIO);
        expect(calls).toHaveLength(1);
        expect(calls[0]?.message).toBe(raw);
        expect(calls[0]?.socket).toBe(socket);
    });

    it('other media keep no fetchData', async () => {
        const { calls, download } = recordingDownload();
        const { socket, received } = await connected(download);

        socket.deliver(waMessage({ chat: ALICE, image: true }));
        await settle();

        const [attachment] = received[0]!.attachments;

        expect(attachment?.type).toBe('image');
        expect(attachment?.fetchData).toBeUndefined();
        expect(calls).toHaveLength(0);
    });

    it('starts a run with the transcript of an allowed sender\'s voice note; a refused sender\'s is never downloaded', async () => {
        const { calls, download } = recordingDownload();
        const transcribed: Uint8Array[] = [];
        const model = new MockTranscriptionModelV4({
            doGenerate: async (options) => {
                transcribed.push(options.audio as Uint8Array);

                return {
                    text: 'Was steht heute an?',
                    segments: [],
                    language: undefined,
                    durationInSeconds: undefined,
                    warnings: [],
                    response: { timestamp: new Date(0), modelId: 'mock-model-id' },
                };
            },
        });
        const value = createWhatsAppFixture({ patch: { voice: { model }, downloadMedia: download } });

        engines.push(value.engine);
        await value.engine.start();
        value.sockets.last().open();

        value.sockets.last().deliver(voiceNote(MALLORY));
        await settle();
        await value.engine.idle();

        expect(calls).toHaveLength(0);
        expect(await value.runs()).toEqual([]);

        value.sockets.last().deliver(voiceNote(ALICE));
        await settle();
        await value.engine.idle();

        await vi.waitFor(async () => {
            expect(await value.runs()).toHaveLength(1);
        });

        const [run] = await value.runs();
        const payload = run!.trigger.payload as ChatPayload;

        expect(payload.message.text).toBe('[Voice message] Was steht heute an?');
        expect(payload.voice).toEqual({
            mediaType: 'audio/ogg; codecs=opus',
            bytes: AUDIO.byteLength,
            seconds: 4,
        });
        expect(calls).toHaveLength(1);
        expect(transcribed).toHaveLength(1);
        expect(new Uint8Array(transcribed[0]!)).toEqual(AUDIO);
    });
});
