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
import type { ChatApprovalPick, ChatApprovalPickInput, ChatApprovalScope } from './types.ts';

/**
 * The approvals a chat reply can answer: the waiting runs (oldest first, at
 * most CHAT_ANSWER_SCAN_MAX scanned) whose approval was sent to this channel
 * and address, has no options and has not expired on the engine's clock.
 */
export async function findOpenChatApprovals(engine: IEngine, scope: ChatApprovalScope): Promise<Run[]> {
    const { data } = await engine.runService.find({
        status: ['waiting'],
        waitKind: 'approval',
        limit: CHAT_ANSWER_SCAN_MAX,
        order: 'asc',
    });
    const now = engine.clock.now();

    return data.filter((run) => {
        const { waiting } = run;

        return waiting?.kind === 'approval' &&
            waiting.channel === scope.channel &&
            waiting.address === scope.address &&
            waiting.options === undefined &&
            new Date(waiting.expiresAt).getTime() > now;
    });
}

/** The platform id of the approval message of an open run, if the platform can tell. */
function findChatApprovalMessageId(run: Run, platform: IChatPlatform): string | undefined {
    if (run.waiting?.kind !== 'approval' || !platform.sentMessageId) {
        return undefined;
    }

    return platform.sentMessageId({ key: `${run.id}:${run.waiting.approvalId}` });
}

/**
 * Which open approval a reply answers. A usable quote (a quoted id on a
 * platform with `sentMessageId`) answers the approval whose message it
 * quotes, tells a closed approval when it quotes an approval message no
 * longer open, and is no answer otherwise (it quotes some other message).
 * Without a usable quote, one open approval is answered and several ask the
 * sender to quote the one meant.
 */
export function pickChatApproval(open: Run[], input: ChatApprovalPickInput): ChatApprovalPick {
    const { quotedId, platform } = input;

    if (quotedId !== undefined && platform?.sentMessageId) {
        const run = open.find((item) => findChatApprovalMessageId(item, platform) === quotedId);

        if (run) {
            return { run };
        }

        return input.isApprovalMessage?.(quotedId) === true ? { notice: 'closed' } : undefined;
    }

    if (open.length === 1) {
        return { run: open[0]! };
    }

    return open.length > 1 ? { notice: 'several' } : undefined;
}
