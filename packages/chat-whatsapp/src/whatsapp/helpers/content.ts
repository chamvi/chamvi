/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { WAMessageContent } from 'baileys';
import { isObject } from 'smob';
import type { WhatsAppContextInfo } from '../types.ts';

/** The context info (mentions, quote) of a message's content, whatever its type. */
export function contextInfoOf(content: WAMessageContent | undefined): WhatsAppContextInfo | undefined {
    if (!content) {
        return undefined;
    }

    for (const value of Object.values(content)) {
        if (isObject(value) && isObject(value.contextInfo)) {
            return value.contextInfo as WhatsAppContextInfo;
        }
    }

    return undefined;
}
