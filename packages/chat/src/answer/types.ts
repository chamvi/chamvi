/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IClock, ModelRef } from '@chamvi/core';
import type { Run } from '@chamvi/store';
import type { LanguageModel } from 'ai';
import type { IChatPlatform } from '../channel/types.ts';

/**
 * Answers to approvals in the chat (`chatChannel({ answers })`): a direct
 * reply of a sender allowed to approve is read by a model as approve, deny
 * or unclear.
 */
export type ChatAnswerOptions = {
    /**
     * The model that reads a reply (a `'<provider>/<model>'` string or a
     * LanguageModel); default the model of the approval's agent, else the engine's.
     */
    model?: ModelRef;
    /** Bound of one classification; default `CHAT_ANSWER_TIMEOUT_MS` (15 s). */
    timeoutMs?: number;
};

/** The answer options after resolveOptions() (internal). */
export type ResolvedChatAnswerOptions = {
    model?: ModelRef;
    timeoutMs: number;
};

/** How a chat reply reads against an approval (internal). */
export type ChatAnswerDecision = 'approve' | 'deny' | 'unclear';

/** The input of classifyChatAnswer() (internal): only the approval title and the reply reach the model. */
export type ChatAnswerClassifyInput = {
    model: LanguageModel;
    /** The approval's title. */
    title: string;
    /** The reply text. */
    text: string;
    timeoutMs: number;
    clock: IClock;
    signal: AbortSignal;
};

/** Where a chat reply came from, to find the approvals open there (internal). */
export type ChatApprovalScope = {
    channel: string;
    address: string;
};

/** What pickChatApproval() reads from a reply besides the open approvals (internal). */
export type ChatApprovalPickInput = {
    channel: string;
    /** The platform id of the message the reply quotes, if any. */
    quotedId?: string;
    platform?: IChatPlatform;
    /** Whether a message id is one of the approval messages this channel sent. */
    isApprovalMessage?: (messageId: string) => boolean;
};

/** The approval a reply answers, a notice for the sender, or undefined: not an answer (internal). */
export type ChatApprovalPick = { run: Run } | { notice: 'several' | 'closed' } | undefined;
