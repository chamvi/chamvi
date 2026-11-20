/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ApprovalWaitPoint, Run } from '@chamvi/store';
import { RunStatus } from '@chamvi/store';
import { ChamviError, ChannelNotFoundError, ErrorCode } from '../../errors/index.ts';
import { deliverOnce } from '../notify/module.ts';
import type { ApprovalDeliveryContext } from './types.ts';

/**
 * Sends the approval message of `waiting` through the channel it names
 * (none: inbox and API only, nothing to send) unless it was delivered
 * already: a successful send records `waiting.notifiedAt`. Its key
 * `<runId>:<approvalId>` is fixed once the wait point is stored, so the
 * channel dedupes a send whose record was lost. A store lock `notify:<runId>:<approvalId>` held for one
 * attempt keeps replicas from sending concurrently; the attempt is aborted
 * after claimTtlMs (the lock's TTL). A failed attempt, or a channel the
 * engine does not have, goes to onError and is retried by tick() on the
 * next poll; the run keeps waiting.
 */
export async function deliverApprovalMessage(ctx: ApprovalDeliveryContext, run: Run, waiting: ApprovalWaitPoint): Promise<void> {
    if (waiting.channel === undefined) {
        return;
    }

    const channel = ctx.getChannel(waiting.channel);

    if (!channel || typeof channel.out !== 'function') {
        ctx.onError(new ChannelNotFoundError(waiting.channel), run);

        return;
    }

    const key = `${run.id}:${waiting.approvalId}`;
    const currentWait = (current: Run | undefined): ApprovalWaitPoint | undefined => (
        current?.status === RunStatus.WAITING && current.waiting?.kind === 'approval' &&
        current.waiting.approvalId === waiting.approvalId ?
            current.waiting :
            undefined
    );
    const controller = new AbortController();

    ctx.deliveryControllers.add(controller);

    try {
        await deliverOnce({
            clock: ctx.clock,
            lockService: ctx.lockService,
            claimTtlMs: ctx.claimTtlMs,
            onError: (error, failed) => ctx.onError(error, failed),
        }, {
            key,
            run,
            signal: controller.signal,
            timeout: () => new ChamviError({
                message: `Channel "${channel.name}" did not deliver approval "${waiting.approvalId}" within ${ctx.claimTtlMs}ms.`,
                code: ErrorCode.TIMEOUT,
            }),
            // another attempt may have delivered it since `run` was read
            pending: async () => {
                const current = currentWait(await ctx.runService.findOne(run.id));

                return current !== undefined && !current.notifiedAt;
            },
            send: (signal) => channel.out!({
                kind: 'approval',
                key,
                runId: run.id,
                agent: run.agent,
                title: waiting.title,
                body: waiting.notification ?? waiting.body ?? '',
                ...(waiting.slot !== undefined ? { slot: waiting.slot } : {}),
                approvalId: waiting.approvalId,
                expiresAt: waiting.expiresAt,
                // artifacts stay in the inbox and the API, never in a channel message
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
            }, waiting.address ?? '', { signal, trigger: run.trigger }),
            record: async (signal) => {
                // answered meanwhile: nothing left to record
                if (!currentWait(await ctx.runService.findOne(run.id))) {
                    return;
                }

                signal.throwIfAborted();

                const notified = await ctx.runService.update(
                    run.id,
                    { waiting: { ...waiting, notifiedAt: new Date(ctx.clock.now()) } },
                    // a newer wait point replaced this one meanwhile: InvalidRunStateError, a stale write
                    { expectStatus: [RunStatus.WAITING], expectWaitId: waiting.approvalId },
                );

                ctx.emit({ type: 'run.updated', run: notified });
            },
            fail: (error, signal) => {
                if (!ctx.isDraining() || !signal.aborted) {
                    ctx.onError(error, run);
                }
            },
        });
    } finally {
        ctx.deliveryControllers.delete(controller);
    }
}
