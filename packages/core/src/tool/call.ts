/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { assertFrameActive, currentToolCall } from '../effect/frame.ts';
import { InvalidRunStateError } from '../errors/index.ts';
import type { ToolContext } from './types.ts';

/** Opaque run/step/call identity, stable on replay. Requires this run's active tool-call frame. */
export function toolCallKey(ctx: Pick<ToolContext, 'run'>): string {
    const frame = currentToolCall();

    if (!frame || frame.runId !== ctx.run.runId) {
        throw new InvalidRunStateError('toolCallKey() requires the active tool call of this run.');
    }

    assertFrameActive(frame, 'toolCallKey()');

    return JSON.stringify([frame.runId, frame.stepIndex, frame.toolCallId]);
}
