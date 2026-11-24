/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { ChannelMessage, ChannelSendOptions } from '@chamvi/core';
import { createChatApprovalRecord, recordChatApprovalSends } from '../../../src/answer/record.ts';

function message(kind: ChannelMessage['kind'], key: string): ChannelMessage {
    return {
        kind,
        key,
        runId: 'r',
        agent: 'a',
        body: 'b',
    };
}

const opts = {} as ChannelSendOptions;

describe('createChatApprovalRecord', () => {
    it('keeps the most recent ids only', () => {
        const record = createChatApprovalRecord(2);

        record.add('a');
        record.add('b');
        record.add('a');
        record.add('c');

        expect(record.has('a')).toBe(true);
        expect(record.has('b')).toBe(false);
        expect(record.has('c')).toBe(true);
    });
});

describe('recordChatApprovalSends', () => {
    it('records the platform id of a sent approval only', async () => {
        const record = createChatApprovalRecord();
        const out = recordChatApprovalSends(async () => {}, { sentMessageId: ({ key }) => `m:${key}` }, record);

        await out(message('approval', 'k1'), 'addr', opts);
        await out(message('message', 'k2'), 'addr', opts);

        expect(record.has('m:k1')).toBe(true);
        expect(record.has('m:k2')).toBe(false);
    });

    it('records nothing for a failed send or a throwing hook', async () => {
        const record = createChatApprovalRecord();
        const failing = recordChatApprovalSends(async () => {
            throw new Error('down');
        }, { sentMessageId: () => 'm:1' }, record);
        const throwing = recordChatApprovalSends(async () => {}, {
            sentMessageId: () => {
                throw new Error('hook');
            },
        }, record);

        await expect(failing(message('approval', 'k'), 'addr', opts)).rejects.toThrow('down');
        await expect(throwing(message('approval', 'k'), 'addr', opts)).resolves.toBeUndefined();
        expect(record.has('m:1')).toBe(false);
    });

    it('is out itself without sentMessageId', () => {
        const out = async () => {};

        expect(recordChatApprovalSends(out, {}, createChatApprovalRecord())).toBe(out);
        expect(recordChatApprovalSends(out, undefined, createChatApprovalRecord())).toBe(out);
    });
});
