/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ChannelMessage, ChannelSendOptions, IChannel } from '@chamvi/core';
import type { IChatPlatform } from '../channel/types.ts';
import { CHAT_ANSWER_RECORD_MAX } from './constants.ts';
import type { IChatApprovalRecord } from './types.ts';

/** A record of approval message ids, evicting the oldest past `max`. */
export function createChatApprovalRecord(max: number = CHAT_ANSWER_RECORD_MAX): IChatApprovalRecord {
    const ids = new Set<string>();

    return {
        add(messageId) {
            // re-added ids move to the end: the most recent stay
            ids.delete(messageId);
            ids.add(messageId);

            while (ids.size > max) {
                ids.delete(ids.values().next().value!);
            }
        },
        has: (messageId) => ids.has(messageId),
    };
}

/**
 * `out` that records the platform id of every approval message it sent
 * (IChatPlatform.sentMessageId); without that hook it is `out` as is.
 */
export function recordChatApprovalSends(
    out: NonNullable<IChannel['out']>,
    platform: IChatPlatform | undefined,
    record: IChatApprovalRecord,
): NonNullable<IChannel['out']> {
    if (!platform?.sentMessageId) {
        return out;
    }

    return async (message: ChannelMessage, address: string, opts: ChannelSendOptions): Promise<void> => {
        await out(message, address, opts);

        if (message.kind !== 'approval') {
            return;
        }

        let id: string | undefined;

        try {
            id = platform.sentMessageId!({ key: message.key });
        } catch {
            // best effort: an unrecorded approval only makes a later quote of it a plain message
            return;
        }

        if (typeof id === 'string' && id.length > 0) {
            record.add(id);
        }
    };
}
