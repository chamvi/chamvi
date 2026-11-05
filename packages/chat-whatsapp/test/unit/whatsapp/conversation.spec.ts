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
import { InvalidAgentDefinitionError, defineModelAgent } from '@chamvi/core';
import type { IEngine, Run } from '@chamvi/core';
import { textModel } from '@chamvi/test-kit';
import {
    ALICE,
    BOT_JID,
    GROUP,
    createWhatsAppFixture,
    settle,
    waMessage,
} from '../../utils/whatsapp.ts';
import type { WhatsAppFixture } from '../../utils/whatsapp.ts';

const engines: IEngine[] = [];

afterEach(async () => {
    await Promise.all(engines.map((engine) => engine.stop()));
    engines.length = 0;
});

async function connected(): Promise<WhatsAppFixture> {
    const value = createWhatsAppFixture({
        agents: (channel) => [defineModelAgent({
            name: 'assistant',
            model: textModel(),
            instructions: 'Answer.',
            conversation: true,
            channels: [channel.on()],
        })],
    });

    engines.push(value.engine);
    await value.engine.start();
    value.sockets.last().open();

    return value;
}

/** The conversation identity and source address intake gave the only run. */
async function intakeOf(value: WhatsAppFixture) {
    const runs = await value.runs();

    expect(runs).toHaveLength(1);

    const run = runs[0] as Run;
    const identity = run.conversation?.scope.identity;

    return {
        channel: identity?.channel,
        account: identity?.account,
        chat: identity?.chat,
        audience: identity?.audience,
        address: run.trigger.address,
    };
}

describe('WhatsAppChatSetup.conversation()', () => {
    it('names the conversation intake computes for a direct chat', async () => {
        const value = await connected();

        value.sockets.last().deliver(waMessage({ chat: ALICE, text: 'hi' }));
        await settle();

        const ref = value.setup.conversation({ chat: ALICE });

        expect(ref).toEqual(await intakeOf(value));
        expect(ref).toMatchObject({
            channel: 'chat',
            account: 'support',
            chat: ALICE,
            audience: `direct:${ALICE}`,
        });
    });

    it('names the conversation intake computes for a group', async () => {
        const value = await connected();

        value.sockets.last().deliver(waMessage({
            chat: GROUP,
            participant: ALICE,
            mentions: [BOT_JID],
            text: 'hi',
        }));
        await settle();

        const ref = value.setup.conversation({ chat: GROUP });

        expect(ref).toEqual(await intakeOf(value));
        expect(ref.audience).toBe(`group:${GROUP}`);
    });

    it('refuses anything but a normalized phone number or group jid', () => {
        const value = createWhatsAppFixture();

        for (const chat of ['491701111111:4@s.whatsapp.net', '900000000000@lid', 'alice', 'alice@s.whatsapp.net', '@s.whatsapp.net', '', 42]) {
            expect(() => value.setup.conversation({ chat } as never)).toThrow(InvalidAgentDefinitionError);
        }

        expect(() => value.setup.conversation(undefined as never)).toThrow(InvalidAgentDefinitionError);
    });
});
