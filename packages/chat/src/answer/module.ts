/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission, can } from '@chamvi/access';
import { ErrorCode } from '@chamvi/core';
import type { IEngine } from '@chamvi/core';
import type { Invoker, Run } from '@chamvi/store';
import type { LanguageModel } from 'ai';
import { isObject } from 'smob';
import { encodeChatAddress, hashKey, reportError } from '../channel/helpers.ts';
import type { ChatIntakeContext, ChatPayload } from '../channel/types.ts';
import type { ChatIncoming } from '../ingress/types.ts';
import { CHAT_ID_MAX_LENGTH } from '../intake/constants.ts';
import { classifyChatAnswer } from './classify.ts';
import { CHAT_ANSWER_NOTICE_CLOSED, CHAT_ANSWER_NOTICE_SEVERAL } from './constants.ts';
import { findOpenChatApprovals, pickChatApproval } from './open.ts';

type ChatAnswerNotice = 'several' | 'closed';

const NOTICE_TEXTS: Record<ChatAnswerNotice, string> = {
    several: CHAT_ANSWER_NOTICE_SEVERAL,
    closed: CHAT_ANSWER_NOTICE_CLOSED,
};

/** The id of the message a reply quotes, when it is a bounded id. */
function quotedIdOf(incoming: ChatIncoming): string | undefined {
    const id: unknown = isObject(incoming.message.replyTo) ? incoming.message.replyTo.id : undefined;

    return typeof id === 'string' && id.length > 0 && id.length <= CHAT_ID_MAX_LENGTH && !id.includes('\0') ? id : undefined;
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
            body: NOTICE_TEXTS[notice],
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

/** The model that reads the reply, or undefined when it does not resolve. */
function resolveChatAnswerModel(ctx: ChatIntakeContext, run: Run): LanguageModel | undefined {
    try {
        return ctx.context.engine.resolveModel(ctx.options.answers?.model, run.agent);
    } catch {
        return undefined;
    }
}

/**
 * Answers an open approval of the reply's chat instead of dispatching the
 * reply (`answers` on). True when the message is handled (an approval
 * answered, or a notice sent): it starts no run. False, so the message is
 * dispatched as usual, for anything uncertain: no `answers`, no direct chat,
 * no invoker, no approval the reply answers, an invoker without
 * `chamvi_agent_approve` for the run's agent (checked before any model call),
 * a model that does not resolve, a reply read as unclear. Several open
 * approvals and an unquoted reply (when the invoker may answer one of them),
 * or a quote of an approval no longer open, get a notice. An approval that settled meanwhile gets the closed notice;
 * any other approve failure rejects (an intake failure).
 */
export async function answerChatApproval(
    ctx: ChatIntakeContext,
    incoming: ChatIncoming,
    payload: ChatPayload,
    invoker: Invoker | undefined,
): Promise<boolean> {
    const { context, options } = ctx;
    const { answers } = options;

    if (!answers || payload.event !== 'direct' || !invoker) {
        return false;
    }

    const { engine } = context;
    const address = encodeChatAddress({ adapter: payload.adapter, threadId: payload.threadId }, options.adapterNames);
    const open = await findOpenChatApprovals(engine, { channel: options.name, address });
    const quotedId = quotedIdOf(incoming);
    const pick = pickChatApproval(open.runs, {
        ...(quotedId !== undefined ? { quotedId } : {}),
        ...(options.platform ? { platform: options.platform } : {}),
        isApprovalMessage: (id) => ctx.approvals.has(id),
        truncated: open.truncated,
    });

    if (!pick) {
        return false;
    }

    if ('notice' in pick) {
        // asking a sender who could answer none of them which one they mean would only swallow their message
        if (pick.notice === 'several' && !await canApproveSomeChatRun(engine, invoker, open.runs)) {
            return false;
        }

        await sendChatAnswerNotice(ctx, payload, address, pick.notice);

        return true;
    }

    const { run } = pick;

    if (run.waiting?.kind !== 'approval' || !await canApproveChatRun(engine, invoker, run)) {
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
        timeoutMs: answers.timeoutMs,
        clock: engine.clock,
        signal: ctx.signal,
    });

    if (decision === 'unclear') {
        return false;
    }

    try {
        await engine.approve(run.id, {
            approvalId: run.waiting.approvalId,
            approved: decision === 'approve',
            reason: payload.message.text,
            approver: invoker,
        });
    } catch (error) {
        // by code, so another core copy's error counts too
        if (isObject(error) && error.code === ErrorCode.INVALID_RUN_STATE) {
            await sendChatAnswerNotice(ctx, payload, address, 'closed');

            return true;
        }

        throw error;
    }

    return true;
}
