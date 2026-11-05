/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConversationRef } from '@chamvi/core';
import { CONVERSATION_FIELD_MAX_LENGTH } from '@chamvi/core';
import { isObject } from 'smob';

const REF_FIELDS = ['channel', 'account', 'chat', 'audience'] as const;

function isField(value: unknown): value is string {
    return typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= CONVERSATION_FIELD_MAX_LENGTH;
}

/**
 * Checks the `conversation` and `text` options of a cron subscription: both
 * or neither, `text` a non-blank string, the reference's fields non-blank
 * strings of at most CONVERSATION_FIELD_MAX_LENGTH and an optional non-blank
 * address. Returns a copy of the pair, undefined without a conversation;
 * throws `fail(reason)` otherwise. The channel's intake checks the rest
 * (control characters, the text's byte bound, the address length) when it
 * dispatches.
 */
export function readCronConversation(
    conversation: unknown,
    text: unknown,
    fail: (reason: string) => Error,
): { conversation: ConversationRef; text: string } | undefined {
    if (conversation === undefined && text === undefined) {
        return undefined;
    }

    if (conversation === undefined) {
        throw fail('has a text without a conversation.');
    }

    if (!isObject(conversation)) {
        throw fail('has a conversation that is not an object.');
    }

    if (typeof text !== 'string' || text.trim().length === 0) {
        throw fail('needs a non-blank text with a conversation.');
    }

    for (const field of REF_FIELDS) {
        if (!isField(conversation[field])) {
            throw fail(`needs a non-blank conversation ${field} of at most ${CONVERSATION_FIELD_MAX_LENGTH} characters.`);
        }
    }

    const { address } = conversation;

    if (address !== undefined && (typeof address !== 'string' || address.trim().length === 0)) {
        throw fail('needs a non-blank conversation address when one is set.');
    }

    return {
        conversation: {
            channel: conversation.channel as string,
            account: conversation.account as string,
            chat: conversation.chat as string,
            audience: conversation.audience as string,
            ...(address !== undefined ? { address } : {}),
        },
        text,
    };
}
