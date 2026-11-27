/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ApprovalWaitPoint } from '@chamvi/core-kit';
import type { ChannelMessage } from '../../channel/types.ts';
import type { IClock } from '../../clock/index.ts';
import type { ApprovalRequest } from '../execute/types.ts';
import type { IEngine } from '../types.ts';

/** What an approval message is built from: a stored wait point, or a request about to suspend. */
type ApprovalMessageSource = Pick<
    ApprovalWaitPoint,
    'approvalId' | 'title' | 'body' | 'notification' | 'slot' | 'options' | 'multiple' | 'expiresAt'
>;

/**
 * The channel message of an approval (internal): the title, the generic
 * notification in place of the body when there is one, the options without
 * their artifacts (those stay in the inbox and the API). Delivery sends it;
 * a channel's `fits` checks it before the call suspends.
 */
export function approvalMessageOf(run: { id: string; agent: string }, waiting: ApprovalMessageSource): ChannelMessage {
    return {
        kind: 'approval',
        key: `${run.id}:${waiting.approvalId}`,
        runId: run.id,
        agent: run.agent,
        title: waiting.title,
        body: waiting.notification ?? waiting.body ?? '',
        ...(waiting.notification !== undefined ? { generic: true as const } : {}),
        ...(waiting.slot !== undefined ? { slot: waiting.slot } : {}),
        approvalId: waiting.approvalId,
        expiresAt: waiting.expiresAt,
        ...(waiting.options !== undefined ?
            {
                options: waiting.options.map((option) => ({
                    id: option.id,
                    label: option.label,
                    ...(option.detail !== undefined ? { detail: option.detail } : {}),
                })),
            } :
            {}),
        ...(waiting.multiple === true ? { multiple: true } : {}),
    };
}

/**
 * Asks the channel an approval request names whether it can deliver the
 * message the request would become (its optional `fits`), before the call
 * suspends: a refusal (a ValidationError) reaches the tool as its error, so
 * an approval the destination cannot render never leaves the run waiting.
 */
export async function assertApprovalFits(
    engine: Pick<IEngine, 'getChannel'>,
    clock: IClock,
    run: { runId: string; agent: string },
    request: ApprovalRequest,
): Promise<void> {
    if (request.channel === undefined) {
        return;
    }

    const channel = engine.getChannel(request.channel);

    if (!channel?.fits) {
        return;
    }

    await channel.fits(approvalMessageOf({ id: run.runId, agent: run.agent }, {
        ...request,
        expiresAt: new Date(clock.now() + request.timeoutMs),
    }), request.address ?? '');
}
