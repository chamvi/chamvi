/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@chamvi/core';
import type { ChannelMessage } from '@chamvi/core';
import { chatAddress } from '@chamvi/chat';
import { createChatChecks } from '../../../src/outbound/module.ts';
import type { ChatRenderSetup } from '../../../src/outbound/types.ts';
import { createFakeAdapter } from '../../utils/adapter.ts';

const DIRECT = chatAddress({ adapter: 'fake', threadId: 'fake:chat-1' });
const GROUP = chatAddress({ adapter: 'fake', threadId: 'fake:chat-2' });

function approval(title: string): ChannelMessage {
    return {
        kind: 'approval',
        key: 'run-1:0:call-1:0',
        runId: 'run-1',
        agent: 'helper',
        title,
        body: '',
        approvalId: '0:call-1:0',
        expiresAt: new Date('2026-11-02T09:00:00Z'),
    };
}

function setup(patch: Partial<ChatRenderSetup> = {}) {
    const adapter = createFakeAdapter();

    adapter.isDirect = (threadId) => threadId === 'fake:chat-1';

    return createChatChecks({
        adapters: [adapter],
        answers: { timeoutMs: 1_000 },
        approvalUrl: ({ runId }) => `https://chamvi.test/approvals/${runId}`,
        maxTextChars: 160,
        ...patch,
    });
}

describe('chat fits and direct', () => {
    it('refuses an approval answerable in the chat that exceeds maxTextChars, as out would', async () => {
        const checks = setup();

        await expect(async () => checks.fits(approval('x'.repeat(300)), DIRECT)).rejects.toThrow(ValidationError);
        await expect(async () => checks.fits(approval('x'.repeat(300)), DIRECT))
            .rejects.toThrow('an approval answered in the chat only whole');
    });

    it('takes what out would cut or send whole', async () => {
        const checks = setup();

        // to a group the approval is not answerable in the chat: cut, with the link
        expect(() => checks.fits(approval('x'.repeat(300)), GROUP)).not.toThrow();
        expect(() => checks.fits(approval('Deploy?'), DIRECT)).not.toThrow();
    });

    it('refuses an address of no listed adapter', async () => {
        const checks = setup();

        await expect(async () => checks.fits(approval('Deploy?'), chatAddress({ adapter: 'other', threadId: 'x' })))
            .rejects.toThrow(ValidationError);
    });

    it('direct is the adapter\'s isDM, false for an address it cannot decode', async () => {
        const checks = setup({ answers: undefined });

        expect(await checks.direct(DIRECT)).toBe(true);
        expect(await checks.direct(GROUP)).toBe(false);
        expect(await checks.direct('not-a-chat-address')).toBe(false);
    });
});
