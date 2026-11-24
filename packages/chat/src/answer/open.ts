/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IEngine } from '@chamvi/core';
import type { Run } from '@chamvi/store';
import type { IChatPlatform } from '../channel/types.ts';
import { CHAT_ANSWER_SCAN_MAX } from './constants.ts';
import type {
    ChatApprovalPick,
    ChatApprovalPickInput,
    ChatApprovalScope,
    ChatOpenApprovals,
} from './types.ts';

/**
 * The approvals a chat reply can answer: the waiting runs (oldest first, at
 * most CHAT_ANSWER_SCAN_MAX scanned) whose approval was sent to this channel
 * and address and delivered there (`notifiedAt`), has no options, is no
 * trust gate (a generic notification: the owner never saw its arguments in
 * the chat) and has not expired on the engine's clock. `truncated` when
 * more waiting approvals exist than scanned.
 */
export async function findOpenChatApprovals(engine: IEngine, scope: ChatApprovalScope): Promise<ChatOpenApprovals> {
    const { data, total } = await engine.runService.find({
        status: ['waiting'],
        waitKind: 'approval',
        limit: CHAT_ANSWER_SCAN_MAX,
        order: 'asc',
    });
    const now = engine.clock.now();

    const runs = data.filter((run) => {
        const { waiting } = run;

        return waiting?.kind === 'approval' &&
            waiting.channel === scope.channel &&
            waiting.address === scope.address &&
            waiting.options === undefined &&
            waiting.notification === undefined &&
            // an approval whose message never reached the chat cannot be answered there
            waiting.notifiedAt !== undefined &&
            new Date(waiting.expiresAt).getTime() > now;
    });

    return { runs, truncated: total > data.length };
}

/** The platform id of the approval message of an open run, if the platform can tell. */
function findChatApprovalMessageId(run: Run, platform: IChatPlatform): string | undefined {
    if (run.waiting?.kind !== 'approval' || !platform.sentMessageId) {
        return undefined;
    }

    return platform.sentMessageId({ key: `${run.id}:${run.waiting.approvalId}` });
}

/**
 * Which open approval a reply answers. A quote answers the approval whose
 * message it quotes and is no answer otherwise (it quotes some other
 * message or an approval no longer open, or the platform has no
 * `sentMessageId` to match it). Without a quote, one open approval is
 * answered and several ask the sender to quote the one meant. After a
 * `truncated` scan nothing is decided from absence: no auto-pick (a notice
 * whenever one is open).
 */
export function pickChatApproval(open: Run[], input: ChatApprovalPickInput): ChatApprovalPick {
    const {
        quotedId,
        platform,
        truncated,
    } = input;

    if (quotedId !== undefined) {
        // a quote the platform cannot match answers nothing: it may quote any other message
        if (!platform?.sentMessageId) {
            return undefined;
        }

        const run = open.find((item) => findChatApprovalMessageId(item, platform) === quotedId);

        return run ? { run } : undefined;
    }

    if (open.length === 1 && !truncated) {
        return { run: open[0]! };
    }

    return open.length > 0 ? { notice: 'several' } : undefined;
}
