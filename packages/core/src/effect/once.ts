/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { InvalidRunStateError } from '../errors/index.ts';
import type { StateSchema } from '../state/types.ts';
import type { ToolContext } from '../tool/types.ts';
import { ONCE_NAME_MAX_LENGTH } from './constants.ts';
import { assertFrameActive, currentToolCall } from './frame.ts';
import { stableHash } from './helpers.ts';

/**
 * The value `fn` resolved the first time this tool call ran it under `name`:
 * recorded in the effect store (key `once:<runId>:<stepIndex>:<hash(toolCallId)>:<name>`),
 * so a call that runs again on resume (the replay rule) gets the same value
 * instead of recomputing one that could differ. The value must be
 * JSON-serialisable; a throwing `fn` records nothing. Throws
 * InvalidRunStateError outside a tool call or for another run's context,
 * ValidationError for a name that is not 1 to ONCE_NAME_MAX_LENGTH characters.
 */
export async function once<T, S extends StateSchema = StateSchema>(
    ctx: ToolContext<S>,
    name: string,
    fn: () => Promise<T>,
): Promise<T> {
    const frame = currentToolCall();

    if (!frame) {
        throw new InvalidRunStateError('once() runs inside a tool call (its execute or the agent hooks), not in the tools factory.');
    }

    if (ctx?.run?.runId !== frame.runId) {
        throw new InvalidRunStateError('once() got the context of another run than the tool call it runs in.');
    }

    assertFrameActive(frame, 'once()');

    if (typeof name !== 'string' || name.length === 0 || name.length > ONCE_NAME_MAX_LENGTH) {
        throw new ValidationError(`A once() name must be a string of 1 to ${ONCE_NAME_MAX_LENGTH} characters.`);
    }

    // the call id hashed: a provider's id cannot run into the name, and the key stays bounded
    const key = `once:${frame.runId}:${frame.stepIndex}:${stableHash(frame.toolCallId)}:${name}`;
    // overlapping calls of one key in this call share one computation; a settled one leaves nothing shared
    const onces = frame.onces ?? new Map<string, Promise<unknown>>();

    frame.onces = onces;

    const shared = onces.get(key);

    if (shared) {
        return shared as Promise<T>;
    }

    const work = (async () => {
        const recorded = await frame.effects.findOne(key);

        if (recorded) {
            return (recorded.result as { value: T }).value;
        }

        const value = await fn();

        // a call whose frame ended meanwhile records nothing
        assertFrameActive(frame, 'once()');
        await frame.effects.save(key, { value });

        return value;
    })();

    onces.set(key, work);

    try {
        return await work;
    } finally {
        onces.delete(key);
    }
}
