/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { cron, cronChannel } from '@chamvi/channel-cron';

describe('cron.on', () => {
    it('rejects an invalid expression', () => {
        expect(() => cron.on('not a cron')).toThrow(InvalidAgentDefinitionError);
        expect(() => cron.on('not a cron')).toThrow(/Invalid cron expression "not a cron"/);
    });

    it('rejects an invalid timezone', () => {
        expect(() => cron.on('0 9 * * *', { timezone: 'Mars/Base' })).toThrow(InvalidAgentDefinitionError);
    });

    it('rejects an unknown overlap policy and an empty id', () => {
        expect(() => cron.on('* * * * *', { overlap: 'sometimes' as never })).toThrow(InvalidAgentDefinitionError);
        expect(() => cron.on('* * * * *', { id: '' })).toThrow(InvalidAgentDefinitionError);
    });

    it('defaults overlap to skip', () => {
        expect(cron.on('*/5 * * * *').options.overlap).toBe('skip');
    });

    it('subscribes to the cron channel with a stable id', () => {
        const s = cron.on('*/5 * * * *');

        expect(s.channel).toBe('cron');
        expect(s.id).toBe('cron:*/5 * * * *');
        expect(s.options.expression).toBe('*/5 * * * *');
    });

    it('takes an id', () => {
        expect(cron.on('*/5 * * * *', { id: 'sweep' }).id).toBe('sweep');
    });

    it('keeps timezone, overlap and payload', () => {
        const s = cron.on('0 * * * *', {
            timezone: 'Europe/Berlin',
            overlap: 'allow',
            payload: { a: 1 },
        });

        expect(s.options).toMatchObject({
            timezone: 'Europe/Berlin',
            overlap: 'allow',
            payload: { a: 1 },
        });
    });

    it('cronChannel().on() subscribes to that channel', () => {
        const s = cronChannel({ name: 'cron-eu' }).on('0 9 * * *', { timezone: 'Europe/Berlin' });

        expect(s.channel).toBe('cron-eu');
        expect(s.id).toBe('cron:0 9 * * *');
        expect(() => cronChannel({ name: 'cron-eu' }).on('nope')).toThrow(InvalidAgentDefinitionError);
    });
});

describe('cron.on with a conversation', () => {
    const ref = {
        channel: 'chat',
        account: 'main',
        chat: 'dm-1',
        audience: 'direct:u-1',
        address: 'dm-1',
    };

    it('keeps the conversation and the text', () => {
        const s = cron.on('0 7 * * *', { conversation: ref, text: 'Brief me' });

        expect(s.options).toMatchObject({ conversation: ref, text: 'Brief me' });
        expect(s.options.conversation).not.toBe(ref);
    });

    it('takes a conversation without an address', () => {
        const rest = {
            channel: ref.channel,
            account: ref.account,
            chat: ref.chat,
            audience: ref.audience,
        };

        expect(cron.on('0 7 * * *', { conversation: rest, text: 'Brief me' }).options.conversation).toEqual(rest);
    });

    it('rejects a conversation without text and text without a conversation', () => {
        expect(() => cron.on('0 7 * * *', { conversation: ref })).toThrow(InvalidAgentDefinitionError);
        expect(() => cron.on('0 7 * * *', { text: 'Brief me' })).toThrow(InvalidAgentDefinitionError);
    });

    it.each(['', ' '.repeat(3), 42])('rejects the text %j', (text) => {
        expect(() => cron.on('0 7 * * *', { conversation: ref, text: text as string })).toThrow(InvalidAgentDefinitionError);
    });

    it.each(['channel', 'account', 'chat', 'audience', 'address'] as const)('rejects an empty %s', (field) => {
        expect(() => cron.on('0 7 * * *', {
            conversation: { ...ref, [field]: '' },
            text: 'Brief me',
        })).toThrow(InvalidAgentDefinitionError);
    });

    it.each(['channel', 'account', 'chat', 'audience'] as const)('rejects a missing %s', (field) => {
        const conversation: Record<string, unknown> = { ...ref };

        delete conversation[field];

        expect(() => cron.on('0 7 * * *', {
            conversation: conversation as never,
            text: 'Brief me',
        })).toThrow(InvalidAgentDefinitionError);
    });

    it('rejects a conversation that is not an object', () => {
        expect(() => cron.on('0 7 * * *', { conversation: 'chat' as never, text: 'Brief me' })).toThrow(InvalidAgentDefinitionError);
    });
});
