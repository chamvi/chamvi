/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ModelMessage } from 'ai';
import type { TriggerEnvelope } from '@chamvi/core-kit';
import { toFilePart } from '../../../artifact/helpers.ts';

export function renderTrigger(envelope: TriggerEnvelope): string {
    const json = JSON.stringify({
        channel: envelope.channel,
        trigger: envelope.trigger,
        payload: envelope.payload,
    }, null, 2);

    return `\`\`\`json\n${json}\n\`\`\``;
}

/**
 * The run's first message: accepted conversation text or the rendered trigger,
 * followed by artifact markers for attachments (hydrated to bytes for the model).
 */
export function initialMessage(envelope: TriggerEnvelope, acceptedText?: string): ModelMessage {
    const text = acceptedText ?? renderTrigger(envelope);

    if (!envelope.attachments?.length) {
        return { role: 'user', content: text };
    }

    return {
        role: 'user',
        content: [{ type: 'text', text }, ...envelope.attachments.map(toFilePart)],
    };
}
