/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolContext } from '@chamvi/core';

/** The call's abort signal combined with the run's. */
export function signalOf(abortSignal: AbortSignal | undefined, context: ToolContext): AbortSignal {
    const { signal } = context.run;

    if (!abortSignal || abortSignal === signal) {
        return signal;
    }

    return AbortSignal.any([abortSignal, signal]);
}
