/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { TriggerEnvelope } from './types.ts';

/**
 * A stored envelope as the current shape: envelopes written before channels
 * hold `source` and `thread`, which fill `channel` and `address` when those
 * are absent. Both legacy keys are dropped; the input is not changed. Repository
 * implementations call it on every envelope they read back.
 */
export function normalizeEnvelope(raw: Record<string, unknown>): TriggerEnvelope {
    const {
        source,
        thread,
        ...rest
    } = raw;
    const output: Record<string, unknown> = { ...rest };

    if (output.channel === undefined && source !== undefined) {
        output.channel = source;
    }

    if (output.address === undefined && thread !== undefined) {
        output.address = thread;
    }

    return output as TriggerEnvelope;
}
