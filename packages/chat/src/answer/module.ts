/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission, can } from '@chamvi/access';
import { ErrorCode } from '@chamvi/errors';
import type { IEngine } from '@chamvi/core';
import type { ApprovalWaitPoint, Invoker, Run } from '@chamvi/core-kit';
import type { LanguageModel } from 'ai';
import { isObject } from 'smob';
import { encodeChatAddress, hashKey, reportError } from '../channel/helpers.ts';
import type { ChatIntakeContext, ChatPayload } from '../channel/types.ts';
import type { ChatIncoming } from '../ingress/types.ts';
import { CHAT_ID_MAX_LENGTH } from '../intake/constants.ts';
import { renderChatMessage } from '../outbound/helpers.ts';
import { classifyChatAnswer } from './classify.ts';
import {
    CHAT_ANSWER_CLAIM_TTL_MS,
    CHAT_ANSWER_NOTICE_CLOSED,
    CHAT_ANSWER_NOTICE_SEVERAL,
    CHAT_ANSWER_NOTICE_SEVERAL_PLAIN,
} from './constants.ts';
import { findOpenChatApprovals, pickChatApproval } from './open.ts';
import type { ChatAnswerDecision } from './types.ts';

type ChatAnswerNotice = 'several' | 'closed';

/** A notice's text; without quote matching no chat message can pick one of several approvals. */
function chatAnswerNoticeText(notice: ChatAnswerNotice, quotes: boolean): string {
    if (notice === 'closed') {
        return CHAT_ANSWER_NOTICE_CLOSED;
    }

    return quotes ? CHAT_ANSWER_NOTICE_SEVERAL : CHAT_ANSWER_NOTICE_SEVERAL_PLAIN;
}

/**
 * The quote of a reply: none (no `replyTo`), the quoted message's id, or
 * `false` for a quote that can name no approval (an id that is no bounded
 * string, or a platform without `sentMessageId` to match it).
 */
function quotedIdOf(incoming: ChatIncoming, ctx: ChatIntakeContext): string | false | undefined {
    const { replyTo } = incoming.message;

    if (replyTo === undefined || replyTo === null) {
        return undefined;
    }

    const id: unknown = isObject(replyTo) ? replyTo.id : undefined;

    if (typeof id !== 'string' || id.length === 0 || id.length > CHAT_ID_MAX_LENGTH || id.includes('\0')) {
        return false;
    }

    return ctx.options.platform?.sentMessageId ? id : false;
}

/**
 * Whether the reply may predate its approval's arrival in the chat (a stale
 * or early "yes"): sent before `notifiedAt`, or with no send time to tell.
 */
function isChatReplyBeforeApproval(payload: ChatPayload, notifiedAt: Date | undefined): boolean {
    const { sentAt } = payload.message;

    return sentAt === undefined || notifiedAt === undefined || Date.parse(sentAt) < new Date(notifiedAt).getTime();
}

/**
 * Whether the invoker holds `chamvi_agent_approve` for the run's agent at the
 * engine clock's time; an agent the engine does not hold counts as private.
 */
function canApproveChatRun(engine: IEngine, invoker: Invoker, run: Run): Promise<boolean> {
    const agent = engine.getAgent(run.agent);

    return can(invoker, Permission.AGENT_APPROVE, {
        attributes: { name: run.agent, private: agent ? agent.definition.private === true : true },
        now: new Date(engine.clock.now()),
    });
}

/** Whether the invoker may answer at least one of the runs. */
async function canApproveSomeChatRun(engine: IEngine, invoker: Invoker, runs: Run[]): Promise<boolean> {
    for (const run of runs) {
        if (await canApproveChatRun(engine, invoker, run)) {
            return true;
        }
    }

    return false;
}

/**
 * Posts a notice to the reply's chat through the channel's own `out`, keyed
 * per message (`answer:<hash>:<notice>`) so a platform may drop a redelivered
 * notice. A failed send is reported to `onError`, never thrown: the message
 * is handled either way.
 */
async function sendChatAnswerNotice(
    ctx: ChatIntakeContext,
    payload: ChatPayload,
    address: string,
    notice: ChatAnswerNotice,
): Promise<void> {
    const { context, options } = ctx;
    const key = `answer:${hashKey([payload.adapter, payload.threadId, payload.message.id])}:${notice}`;

    try {
        await ctx.out({
            kind: 'message',
            key,
            runId: '',
            agent: '',
            body: chatAnswerNoticeText(notice, !!options.platform?.sentMessageId),
        }, address, {
            signal: ctx.signal,
            // no run: a minimal envelope of the reply
            trigger: {
                id: key,
                agent: '',
                trigger: 'answer',
                channel: options.name,
                payload: structuredClone(payload),
                address,
                receivedAt: new Date(context.engine.clock.now()),
            },
        });
    } catch (error) {
        reportError(options, error);
    }
}

/** The durable claim of a reply's answer: one per channel, adapter, thread, author and message. */
function chatAnswerClaimOf(ctx: ChatIntakeContext, payload: ChatPayload): { scope: string; key: string } {
    return {
        scope: `chat_answer:${ctx.options.name}`,
        key: hashKey([payload.adapter, payload.threadId, payload.message.author.id, payload.message.id]),
    };
}

/**
 * Whether the approval's message, rendered now with the channel's current
 * options to this direct chat, is whole (answerable, never cut). Only today's
 * options are known: an approval sent cut under a lower `maxTextChars` or
 * with `approvalUrl` set may render whole after those change.
 */
function isChatApprovalWhole(ctx: ChatIntakeContext, run: Run, waiting: ApprovalWaitPoint): boolean {
    try {
        renderChatMessage({
            kind: 'approval',
            key: `${run.id}:${waiting.approvalId}`,
            runId: run.id,
            agent: run.agent,
            title: waiting.title,
            body: waiting.body ?? '',
            approvalId: waiting.approvalId,
            expiresAt: waiting.expiresAt,
        }, { ...ctx.options, direct: true });

        return true;
    } catch {
        return false;
    }
}

/** The model that reads the reply, or undefined (reported to `onError`) when it does not resolve. */
function resolveChatAnswerModel(ctx: ChatIntakeContext, run: Run): LanguageModel | undefined {
    try {
        return ctx.context.engine.resolveModel(ctx.options.answers?.model, run.agent);
    } catch (error) {
        reportError(ctx.options, error);

        return undefined;
    }
}

/** What a reply was read as before its answer: handled already (a notice), not an answer, or the answer to give. */
type ChatAnswerPlan = boolean | {
    run: Run;
    approvalId: string;
    decision: Exclude<ChatAnswerDecision, 'unclear'>
};

/**
 * Everything before the answer: the pick, the guards, the classification
 * and the durable claim. True when handled (a notice sent, or the reply
 * answered already), false to dispatch it, else the answer to give.
 */
async function planChatAnswer(
    ctx: ChatIntakeContext,
    payload: ChatPayload,
    invoker: Invoker,
    quotedId: string | undefined,
): Promise<ChatAnswerPlan> {
    const { context, options } = ctx;
    const { engine } = context;
    const address = encodeChatAddress({ adapter: payload.adapter, threadId: payload.threadId }, options.adapterNames);
    const open = await findOpenChatApprovals(engine, { channel: options.name, address });
    const pick = pickChatApproval(open.runs, {
        ...(quotedId !== undefined ? { quotedId } : {}),
        ...(options.platform ? { platform: options.platform } : {}),
        truncated: open.truncated,
    });

    if (!pick) {
        return false;
    }

    if ('notice' in pick) {
        // asking a sender who could answer none of them which one they mean would only swallow their message
        if (!await canApproveSomeChatRun(engine, invoker, open.runs)) {
            return false;
        }

        await sendChatAnswerNotice(ctx, payload, address, pick.notice);

        return true;
    }

    const { run } = pick;

    // a reply sent before the approval reached the chat answers something else
    if (
        run.waiting?.kind !== 'approval' ||
        isChatReplyBeforeApproval(payload, run.waiting.notifiedAt) ||
        !isChatApprovalWhole(ctx, run, run.waiting) ||
        !await canApproveChatRun(engine, invoker, run)
    ) {
        return false;
    }

    const model = resolveChatAnswerModel(ctx, run);

    if (!model) {
        return false;
    }

    const decision = await classifyChatAnswer({
        model,
        title: run.waiting.title,
        text: payload.message.text,
        timeoutMs: options.answers!.timeoutMs,
        clock: engine.clock,
        signal: ctx.signal,
        onError: (error) => reportError(options, error),
    });

    if (decision === 'unclear') {
        return false;
    }

    // one approval per reply, durably: a redelivery after this answer never answers a later approval
    const { scope, key } = chatAnswerClaimOf(ctx, payload);
    const claim = await engine.idempotencyService.claim(scope, key, run.id, CHAT_ANSWER_CLAIM_TTL_MS);

    if (!claim.created) {
        return true;
    }

    return {
        run,
        approvalId: run.waiting.approvalId,
        decision,
    };
}

/**
 * Answers an open approval of the reply's chat instead of dispatching the
 * reply (`answers` on). True when the message is handled (an approval
 * answered, a reply that already answered one, or a notice sent): it starts
 * no run. False, so the message is dispatched as usual, for anything
 * uncertain: no `answers`, no direct chat, no invoker, a quote that names
 * no open approval, no approval the reply answers, an invoker without
 * `chamvi_agent_approve` for the run's agent (checked before any model
 * call), a reply sent before the approval reached the chat or without a
 * send time, an approval whose message would not render whole now (it was
 * or would be sent cut), a model that does not resolve, a reply read as unclear, and
 * any failure before the answer (reported to `onError`; the dispatch keeps
 * its own retry). Several open approvals and an unquoted reply (when the
 * invoker may answer one of them) get a notice.
 * Each reply answers at most once: a durable claim (`chat_answer:<channel>`,
 * apart from every dispatch scope; per adapter, thread, author and message)
 * is taken right before the answer, and a reply whose claim is held is
 * handled before the scan, so a redelivery answers no later approval and
 * starts no run. An approval that settled meanwhile gets the closed notice;
 * any other approve failure releases the claim (so a redelivery may answer;
 * a failed release is reported and leaves the reply consumed) and rejects
 * (an intake failure).
 */
export async function answerChatApproval(
    ctx: ChatIntakeContext,
    incoming: ChatIncoming,
    payload: ChatPayload,
    invoker: Invoker | undefined,
): Promise<boolean> {
    const { context, options } = ctx;

    if (!options.answers || payload.event !== 'direct' || !invoker) {
        return false;
    }

    const quotedId = quotedIdOf(incoming, ctx);

    // a quote that can name no approval is a plain message: it never falls back to the one open
    if (quotedId === false) {
        return false;
    }

    const claim = chatAnswerClaimOf(ctx, payload);
    let plan: ChatAnswerPlan;

    try {
        // a reply that answered already (a redelivery) is handled, even once nothing is open any more
        if (await context.engine.idempotencyService.findOne(claim.scope, claim.key)) {
            return true;
        }

        plan = await planChatAnswer(ctx, payload, invoker, quotedId);
    } catch (error) {
        // a store failure before the answer must not lose the message: it is dispatched with its retry
        reportError(options, error);

        return false;
    }

    if (typeof plan === 'boolean') {
        return plan;
    }

    try {
        await context.engine.approve(plan.run.id, {
            approvalId: plan.approvalId,
            approved: plan.decision === 'approve',
            reason: payload.message.text,
            approver: invoker,
        });
    } catch (error) {
        // by code, so another core copy's error counts too
        if (isObject(error) && error.code === ErrorCode.INVALID_RUN_STATE) {
            const address = encodeChatAddress({ adapter: payload.adapter, threadId: payload.threadId }, options.adapterNames);

            await sendChatAnswerNotice(ctx, payload, address, 'closed');

            return true;
        }

        // the approval is still open: a redelivery of this reply may answer it
        try {
            await context.engine.idempotencyService.release(claim.scope, claim.key, plan.run.id);
        } catch (released) {
            reportError(options, released);
        }

        throw error;
    }

    return true;
}
