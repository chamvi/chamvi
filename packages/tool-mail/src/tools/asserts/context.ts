/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ToolContext } from '@chamvi/core';
import type { MailClientSource } from '../types.ts';

/** The call's abort signal combined with the run's. */
export function signalOf(abortSignal: AbortSignal | undefined, context: ToolContext): AbortSignal {
    const { signal } = context.run;

    if (!abortSignal || abortSignal === signal) {
        return signal;
    }

    return AbortSignal.any([abortSignal, signal]);
}

/**
 * The `taint` classification of every mail tool, decided before the call
 * runs: a read taints the run, also when it fails. Only the client of an app
 * without accounts (`configured: false`) does not, since its refusal carries
 * nothing from outside.
 */
export function taintOf(source: MailClientSource): (input: unknown, context: ToolContext) => boolean {
    return (_input, context) => source(context).configured !== false;
}
