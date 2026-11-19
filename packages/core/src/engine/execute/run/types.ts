/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { FinishReason, StepResult, ToolSet } from 'ai';
import type { splitInstructions } from '../../../message/helpers.ts';
import type { assembleTools } from '../helpers/index.ts';

/** The agent's configured instructions, split into the SDK instructions and the transient messages (internal). */
export type ConfiguredInstructions = ReturnType<typeof splitInstructions>;

/** The wrapped tool set of one execution (internal). */
export type AssembledTools = Awaited<ReturnType<typeof assembleTools>>;

/** How the replay of the checkpoint's pending calls ended (internal). */
export type PendingCallsOutcome = 'paused' | 'failed' | 'done';

/** What a fully consumed model stream left (internal). */
export type ExecutionStreamResult = {
    /** The stream itself: its structured `output` is read only when the run settles with one. */
    stream: { readonly output: PromiseLike<unknown> };
    steps: StepResult<ToolSet>[];
    finishReason: FinishReason;
    text: string;
};
