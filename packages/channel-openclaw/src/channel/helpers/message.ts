/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import type { ChannelMessage } from '@chamvi/core';
import {
    APPROVAL_HINT,
    CHOICE_HINT,
    IDEMPOTENCY_KEY_MAX_LENGTH,
    MESSAGE_BODY_MAX_LENGTH,
} from '../constants.ts';
import type { ResolvedOpenclawOptions } from '../types.ts';

/**
 * `text` when it has at most `max` characters, else its first `max`
 * characters (one less when that would end on a high surrogate) and a note
 * of how many were cut.
 */
export function cutText(text: string, max: number): string {
    if (text.length <= max) {
        return text;
    }

    let end = max;
    const last = text.charCodeAt(end - 1);

    if (last >= 0xD800 && last <= 0xDBFF) {
        end--;
    }

    return `${text.slice(0, end)}\n… (cut, ${text.length - end} more characters)`;
}

/**
 * The text OpenClaw's agent turn relays: deterministic for one message (no
 * clock value, no random id), so a resend replays instead of starting a
 * second run. An approval links to the UI with `approvalUrl` (run and
 * approval id), else names where to answer; a choice approval lists its
 * options (`- <id>: <label>`, the details stay in the UI). It never carries
 * the resume token, which no channel message holds.
 */
export function renderMessage(
    message: ChannelMessage,
    options: Pick<ResolvedOpenclawOptions, 'approvalUrl'>,
): string {
    const { approvalUrl } = options;
    const sections = ['chamvi message. Relay it to the user; keep every link and id exactly as written.'];

    if (message.title) {
        sections.push(message.title);
    }

    // an approval asked without a body has none
    if (message.body) {
        sections.push(cutText(message.body, MESSAGE_BODY_MAX_LENGTH));
    }

    const choice = message.kind === 'approval' && message.options !== undefined && message.options.length > 0;

    if (choice) {
        const heading = message.multiple === true ? 'Options (choose one or more):' : 'Options (choose one):';

        sections.push([heading, ...(message.options ?? []).map((option) => `- ${option.id}: ${option.label}`)].join('\n'));
    }

    sections.push(`Agent: ${message.agent}\nRun: ${message.runId}`);

    if (message.kind === 'approval') {
        const lines: string[] = [];

        if (message.expiresAt) {
            lines.push(`Expires: ${message.expiresAt.toISOString()}`);
        }

        const link = approvalUrl && message.approvalId ?
            approvalUrl({
                runId: message.runId,
                approvalId: message.approvalId,
                agent: message.agent,
            }) :
            undefined;

        if (choice) {
            lines.push(link ? `Choose and approve or deny: ${link}` : CHOICE_HINT);
        } else {
            lines.push(link ? `Approve or deny: ${link}` : APPROVAL_HINT);
        }

        sections.push(lines.join('\n'));
    }

    return sections.join('\n\n');
}

/**
 * The key as OpenClaw uses it (visible ASCII, at most 256 characters), else a
 * stable `sha256:<hex>` stand-in: OpenClaw trims a key and ignores a longer
 * one, which would turn off its replay.
 */
export function transportKey(key: string): string {
    if (key.length <= IDEMPOTENCY_KEY_MAX_LENGTH && /^[\x21-\x7E]+$/.test(key)) {
        return key;
    }

    return `sha256:${createHash('sha256').update(key).digest('hex')}`;
}
