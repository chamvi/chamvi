/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RunStatus } from '@chamvi/store';
import type { Run, Usage } from '@chamvi/store';
import type { DispatchOutcome } from '../types.ts';

/** Whether a waited-on run has settled (`completed`, `failed` or `cancelled`). */
export function isRunSettled(run: Pick<Run, 'status'>): boolean {
    return run.status === RunStatus.COMPLETED || run.status === RunStatus.FAILED || run.status === RunStatus.CANCELLED;
}

/** A settled run's outcome (its role is the subscription id it was dispatched to). */
export function toDispatchOutcome(run: Run): DispatchOutcome {
    const status = run.status as DispatchOutcome['status'];

    return {
        runId: run.id,
        agent: run.agent,
        role: run.trigger.parent?.role ?? run.trigger.trigger,
        status,
        ...(status === RunStatus.COMPLETED && run.output !== undefined ? { output: run.output } : {}),
        ...(status !== RunStatus.COMPLETED && run.error ? { error: { code: run.error.code, message: run.error.message } } : {}),
    };
}

/**
 * The subtree usage of a run from its `children`: their usage plus their
 * own subtreeUsage, where `fresh` (a child's id and a total computed for it)
 * replaces that child's stored subtreeUsage.
 */
export function sumSubtreeUsage(children: readonly Run[], fresh?: { runId: string; usage: Usage }): Usage {
    const total: Usage = { inputTokens: 0, outputTokens: 0 };

    for (const child of children) {
        const below = fresh?.runId === child.id ? fresh.usage : child.subtreeUsage;

        total.inputTokens += child.usage.inputTokens + (below?.inputTokens ?? 0);
        total.outputTokens += child.usage.outputTokens + (below?.outputTokens ?? 0);
    }

    return total;
}
