/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ModelRef } from '@chamvi/core';

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
