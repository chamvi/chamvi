/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { ApiError, RunWire } from '@chamvi/ui-kit';
import { Permission } from '@chamvi/access';
import { shortId } from '../runs/helpers.ts';
import { JSON_BODY_MAX_LENGTH } from './constants.ts';
import type {
    ApprovalLink,
    ApprovalWaitWire,
    DecidedApproval,
    DetailLine,
    LinkNotice,
    LinkedApprovalState,
    NotifiedLine,
} from './types.ts';

/** The first non-empty string of a query value (a repeated key is an array). */
function firstToken(value: unknown): string | undefined {
    const values: unknown[] = Array.isArray(value) ? value : [value];

    return values.find((item): item is string => typeof item === 'string' && item.length > 0);
}

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
 * The token-less approval link of a query (`?run=<runId>&approval=<approvalId>`,
 * a repeated key's first non-empty value): `undefined` without a run, the
 * approval optional (the run's current one).
 */
export function readApprovalLink(query: Record<string, unknown>): ApprovalLink | undefined {
    const runId = firstToken(query.run);

    if (!runId) {
        return undefined;
    }

    const approvalId = firstToken(query.approval);

    return approvalId ? { runId, approvalId } : { runId };
}

/** The query of a run's approval link, for in-app links to the inbox. */
export function approvalLinkQuery(run: RunWire): Record<string, string> {
    const waiting = approvalWaitOf(run);

    return waiting ? { run: run.id, approval: waiting.approvalId } : { run: run.id };
}

/**
 * The agents of `runs` the session may answer approvals for: every one
 * while it is allowed `chamvi_agent_approve`, else none. The verdict is an
 * upper bound; the server decides per agent and a refusal shows as 403.
 */
export function approvableAgents(
    allowed: (name: string) => boolean,
    runs: Iterable<Pick<RunWire, 'agent'>>,
): Set<string> {
    if (!allowed(Permission.AGENT_APPROVE)) {
        return new Set();
    }

    return new Set(Array.from(runs, (run) => run.agent));
}

/**
 * Where a linked approval stands: answered from this page (an `answered`
 * result for that run and approval), pending (the run waits on it, not
 * expired, the run's agent is in `approvable`), forbidden (the same
 * without it) or moved on (not waiting, another approval, or expired).
 * Without a run yet: 404 is `not-found`, 403 `unreadable`, any other error
 * `failed`, else `loading`; a run loaded earlier wins over a later failed
 * reload. A pending or forbidden run stays `loading` while `approvable` is
 * `undefined` (the verdicts are out). Without `link.approvalId` the run's
 * current approval is the linked one.
 */
export function linkedApprovalState(input: {
    link: ApprovalLink;
    run: RunWire | undefined;
    error: ApiError | undefined;
    decided: readonly DecidedApproval[];
    /** The agents the session may approve for (`approvableAgents`); `undefined` while that is out. */
    approvable: ReadonlySet<string> | undefined;
    now: number;
}): LinkedApprovalState {
    const {
        link,
        run,
        error,
    } = input;

    if (!run) {
        if (error?.status === 404) {
            return { kind: 'not-found' };
        }

        if (error?.status === 403) {
            return { kind: 'unreadable' };
        }

        if (error) {
            return { kind: 'failed', message: error.message };
        }

        return { kind: 'loading' };
    }

    const waiting = approvalWaitOf(run);
    const approvalId = link.approvalId ?? waiting?.approvalId;
    const answered = input.decided.some((d) => d.result === 'answered' &&
        d.run.id === run.id &&
        approvalWaitOf(d.run)?.approvalId === approvalId);

    if (answered) {
        return { kind: 'answered', run };
    }

    if (!waiting) {
        return {
            kind: 'moved-on',
            reason: 'not-waiting',
            run,
        };
    }

    if (waiting.approvalId !== approvalId) {
        return {
            kind: 'moved-on',
            reason: 'other-approval',
            run,
        };
    }

    if (Date.parse(waiting.expiresAt) <= input.now) {
        return {
            kind: 'moved-on',
            reason: 'expired',
            run,
        };
    }

    if (!input.approvable) {
        return { kind: 'loading' };
    }

    if (!input.approvable.has(run.agent)) {
        return { kind: 'forbidden', run };
    }

    return { kind: 'pending', run };
}

/** The notice for a linked approval this page cannot answer; `undefined` while loading, pending or answered. */
export function linkNotice(state: LinkedApprovalState, link: ApprovalLink): LinkNotice | undefined {
    switch (state.kind) {
        case 'forbidden':
            return {
                status: 403,
                text: `Answering this approval needs ${Permission.AGENT_APPROVE} for ${state.run.agent}, which you do not hold.`,
                runId: state.run.id,
            };
        case 'unreadable':
            return { status: 403, text: `Run ${shortId(link.runId)} is not readable with your permissions (${Permission.RUN_READ} or ${Permission.AGENT_RUN} for its agent).` };
        case 'not-found':
            return { text: `Run ${shortId(link.runId)} was not found.` };
        case 'failed':
            return { text: `Run ${shortId(link.runId)} could not be loaded: ${state.message}` };
        case 'moved-on': {
            const texts = {
                'not-waiting': `This run no longer waits on this approval: it is ${state.run.status} now.`,
                'other-approval': `This run now waits on another approval (${approvalWaitOf(state.run)?.toolName}); it is listed below.`,
                expired: 'This approval expired; the engine denies it on its next poll.',
            } as const;

            return { text: texts[state.reason], runId: state.run.id };
        }
        default:
            return undefined;
    }
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

/** A detail reads as a diff when a line starts with `@@ ` or a `--- ` line is followed by a `+++ ` line. */
export function isDiffDetail(detail: string): boolean {
    const lines = detail.split('\n');

    return lines.some((line, index) => line.startsWith('@@ ') ||
        (line.startsWith('--- ') && (lines[index + 1] ?? '').startsWith('+++ ')));
}

/** The lines of an option's detail, each marked add, del or hunk when the detail is a diff. */
export function detailLines(detail: string): DetailLine[] {
    const lines = detail.split('\n');

    if (!isDiffDetail(detail)) {
        return lines.map((text) => ({ text }));
    }

    return lines.map((text) => {
        if (text.startsWith('@@')) {
            return { text, kind: 'hunk' as const };
        }

        if (text.startsWith('+') && !text.startsWith('+++')) {
            return { text, kind: 'add' as const };
        }

        if (text.startsWith('-') && !text.startsWith('---')) {
            return { text, kind: 'del' as const };
        }

        return { text };
    });
}

/**
 * The parsed body when it is a JSON object or array (a trust approval's
 * `{ tool, input, taint }`), shown as a JSON block; else undefined (text).
 */
export function jsonBody(body: string): unknown {
    const text = body.trim();

    // a large body would render one element per token: it stays text
    if (text.length > JSON_BODY_MAX_LENGTH || (!text.startsWith('{') && !text.startsWith('['))) {
        return undefined;
    }

    try {
        const value: unknown = JSON.parse(text);

        return isObject(value) || Array.isArray(value) ? value : undefined;
    } catch {
        return undefined;
    }
}
