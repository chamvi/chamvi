/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import type { RunWire } from '@chamvi/http-kit';
import type { ApprovalWaitWire, DecidedApproval, NotifiedLine } from '../types.ts';

/** The run's approval wait point; `undefined` without one or for a dispatch wait. */
export function approvalWaitOf(run: Pick<RunWire, 'waiting'> | undefined): ApprovalWaitWire | undefined {
    return run?.waiting?.kind === 'approval' ? run.waiting : undefined;
}

/**
 * The inbox's open approvals: every waiting run but the linked one
 * (`linkRunId`) and those whose current approval was answered here. The
 * match is on run and approval id, so a run that pauses on its next
 * approval shows up again.
 */
export function pendingApprovals(
    runs: readonly RunWire[],
    decided: readonly DecidedApproval[],
    linkRunId?: string,
): RunWire[] {
    return runs.filter((run) => run.id !== linkRunId && decided.every((d) => !(
        d.result === 'answered' &&
        d.run.id === run.id &&
        approvalWaitOf(d.run)?.approvalId === approvalWaitOf(run)?.approvalId
    )));
}

/**
 * The callout's "notified" line: the channel (and address) the approval went
 * out through once sent, `inbox only` for a request that names no channel,
 * else "not sent (retrying)" (the engine re-sends on every poll).
 */
export function notifiedLine(run: RunWire): NotifiedLine {
    const waiting = approvalWaitOf(run);

    if (!waiting?.channel) {
        return { text: 'inbox only', warn: false };
    }

    if (waiting.notifiedAt) {
        return { text: waiting.address ? `${waiting.channel} · ${waiting.address}` : waiting.channel, warn: false };
    }

    return { text: 'not sent (retrying)', warn: true };
}

/**
 * Whether the selection fits the wait point (core's rule): always without
 * options, exactly one for a single choice, at least one for a multiple one.
 */
export function canApprove(waiting: { options?: unknown[]; multiple?: boolean }, selected: readonly string[]): boolean {
    if (!waiting.options || waiting.options.length === 0) {
        return true;
    }

    return waiting.multiple ? selected.length > 0 : selected.length === 1;
}
