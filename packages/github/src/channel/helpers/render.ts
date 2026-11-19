/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import type { ChannelMessage } from '@chamvi/core';
import type { ApprovalOption } from '@chamvi/store';
import {
    BACKTICK_RUN_MAX_LENGTH,
    COMMENT_BODY_MAX_LENGTH,
    SAFE_KEY_PATTERN,
} from '../constants.ts';
import type { GithubApprovalRef } from '../types.ts';

const SAFE_KEY = new RegExp(SAFE_KEY_PATTERN);

/**
 * The key as the marker holds it, else a stable `sha256:<hex>` stand-in: an
 * HTML comment breaks on `--` (and `-->`), whitespace or a long key.
 */
export function markerKey(key: string): string {
    if (SAFE_KEY.test(key) && !key.includes('--')) {
        return key;
    }

    return `sha256:${createHash('sha256').update(key).digest('hex')}`;
}

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

/** Backticks, one more than the longest run of backticks in `text`, at least three. */
export function fenceFor(text: string): string {
    let longest = 0;

    for (const run of text.match(/`+/g) ?? []) {
        longest = Math.max(longest, run.length);
    }

    return '`'.repeat(Math.max(3, longest + 1));
}

/** Breaks backtick runs above `BACKTICK_RUN_MAX_LENGTH` with zero-width spaces, so no fence grows past it. */
function breakBacktickRuns(text: string): string {
    const pattern = new RegExp(`\`{${BACKTICK_RUN_MAX_LENGTH + 1},}`, 'g');
    const chunk = new RegExp(`\`{1,${BACKTICK_RUN_MAX_LENGTH}}`, 'g');

    return text.replace(pattern, (run) => (run.match(chunk) ?? []).join('\u{200B}'));
}

/**
 * A title as one line that notifies nobody and links nothing: whitespace
 * runs collapsed, and a zero-width joiner after every `@` and `#` and inside
 * `GH-<n>`, so a `@login`, `@org/team`, `#123`, `owner/repo#1` or `GH-1`
 * in it (titles come from tool code, often from model or issue text) is
 * plain text.
 */
export function neutralizeTitle(title: string): string {
    return title
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[@#]/g, (char) => `${char}\u200D`)
        .replace(/\b(GH)-(?=\d)/gi, '$1\u200D-');
}

/**
 * The options of a choice approval: the heading line, then `- <id>: <label>`
 * per option in a fence (so no mention or reference in a label fires). The
 * details live in the UI only.
 */
export function renderOptions(options: readonly ApprovalOption[], multiple: boolean): string {
    const list = breakBacktickRuns(options.map((option) => `- ${option.id}: ${option.label}`).join('\n'));
    const fence = fenceFor(list);

    return `${multiple ? 'Options (choose one or more):' : 'Options (choose one):'}\n${fence}\n${list}\n${fence}`;
}

/**
 * The comment: mentions, the title (when given, neutralized), the body
 * (when not empty) in a fence no backtick run in it can close (so a
 * `@login` or `#123` inside notifies nobody), for a choice approval the
 * options (the body cut by their length, so the comment stays under
 * GitHub's limit), the approval line (a link with run and approval id,
 * never a token), the run and the marker.
 */
export function renderComment(
    message: ChannelMessage,
    input: {
        mentions: readonly string[];
        approvalUrl?: (ref: GithubApprovalRef) => string;
        marker: string
    },
): string {
    const sections: string[] = [];

    if (input.mentions.length > 0) {
        sections.push(input.mentions.map((login) => `@${login}`).join(' '));
    }

    if (message.title !== undefined) {
        sections.push(`### ${neutralizeTitle(message.title)}`);
    }

    const choice = message.kind === 'approval' && message.options !== undefined && message.options.length > 0;
    const options = choice ? renderOptions(message.options!, message.multiple === true) : undefined;

    if (message.body.length > 0) {
        const body = breakBacktickRuns(cutText(message.body, COMMENT_BODY_MAX_LENGTH - (options?.length ?? 0)));
        const fence = fenceFor(body);

        sections.push(`${fence}\n${body}\n${fence}`);
    }

    if (options !== undefined) {
        sections.push(options);
    }

    const footer: string[] = [];

    if (message.kind === 'approval') {
        const until = message.expiresAt ? `Waiting for approval until ${message.expiresAt.toISOString()}.` : 'Waiting for approval.';
        const link = input.approvalUrl && message.approvalId ?
            input.approvalUrl({
                runId: message.runId,
                approvalId: message.approvalId,
                agent: message.agent,
            }) :
            undefined;

        if (choice) {
            footer.push(link ?
                `${until} Choose and approve or deny: ${link}` :
                `${until} Choose in the chamvi UI or through POST /runs/:id/approve with selected.`);
        } else {
            footer.push(link ?
                `${until} Approve or deny: ${link}` :
                `${until} Answer it in the chamvi UI or through POST /runs/:id/approve.`);
        }
    }

    footer.push(`Run \`${message.runId}\` of agent \`${message.agent}\`.`);
    sections.push(footer.join('\n'), input.marker);

    return sections.join('\n\n');
}
