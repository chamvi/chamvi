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
} from 'vitest';
import type { ChatInstance, Message } from 'chat';
import { ControllableClock } from '@chamvi/test-kit';
import { createWhatsAppAdapter } from '../../../src/whatsapp/adapter.ts';
import type { WhatsAppAdapter } from '../../../src/whatsapp/types.ts';
import { createRecordingAuth } from '../../utils/auth.ts';
import {
    ALICE,
    GROUP,
    createFakeSockets,
    settle,
    waMessage,
} from '../../utils/whatsapp.ts';
import type { FakeSocket } from '../../utils/whatsapp.ts';

const adapters: WhatsAppAdapter[] = [];

afterEach(async () => {
    await Promise.all(adapters.map((adapter) => adapter.connection.close()));
    adapters.length = 0;
});

/** An adapter over a fake socket whose messages land in `received` (a ChatInstance that only takes messages). */
async function connected(): Promise<{ socket: FakeSocket; received: Message[] }> {
    const sockets = createFakeSockets();
    const received: Message[] = [];
    const adapter = createWhatsAppAdapter({
        account: 'support',
        userName: 'chamvi',
        auth: createRecordingAuth().provider,
        socketFactory: sockets.factory,
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

describe('WhatsApp adapter quotes', () => {
    it('hands over a swipe reply with the quoted message id as replyTo, in the same thread', async () => {
        const { socket, received } = await connected();

        socket.deliver(waMessage({
            chat: ALICE,
            text: 'yes',
            quoted: { id: 'X' },
        }));
        await settle();

        const [message] = received;

        expect(message?.replyTo?.id).toBe('X');
        expect(message?.replyTo?.threadId).toBe(message?.threadId);
        expect(message?.replyTo?.text).toBe('');
        expect(message?.replyTo?.raw).toBeUndefined();
        expect(message?.replyTo?.author).toEqual({
            userId: '',
            userName: '',
            fullName: '',
            isBot: false,
            isMe: false,
        });
    });

    it('names the quoted participant of a group quote as its author', async () => {
        const { socket, received } = await connected();

        socket.deliver(waMessage({
            chat: GROUP,
            participant: ALICE,
            quoted: { id: 'Y', participant: '4900000000000@s.whatsapp.net' },
        }));
        await settle();

        expect(received[0]?.replyTo?.id).toBe('Y');
        expect(received[0]?.replyTo?.author.userId).toBe('4900000000000@s.whatsapp.net');
    });

    it('sets no replyTo without a quote, nor for a mention only', async () => {
        const { socket, received } = await connected();

        socket.deliver(
            waMessage({ chat: ALICE }),
            waMessage({ chat: ALICE, mentions: [ALICE] }),
        );
        await settle();

        expect(received).toHaveLength(2);
        expect(received.map((message) => message.replyTo)).toEqual([undefined, undefined]);
    });

    it('marks a quote without a usable id with an empty replyTo id, so it never falls back to the one open approval', async () => {
        const { socket, received } = await connected();

        socket.deliver(
            waMessage({ chat: ALICE, quoted: { id: '' } }),
            waMessage({ chat: ALICE, quoted: { id: null } }),
            waMessage({ chat: ALICE, quoted: {} }),
        );
        await settle();

        expect(received).toHaveLength(3);
        expect(received.map((message) => message.replyTo?.id)).toEqual(['', '', '']);
    });

    it('takes a quoted id without the quoted content as a quote too', async () => {
        const { socket, received } = await connected();

        socket.deliver(waMessage({ chat: ALICE, quoted: { id: 'Z', content: false } }));
        await settle();

        expect(received[0]?.replyTo?.id).toBe('Z');
    });
});
