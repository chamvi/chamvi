/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import type { ApiError, RunWire } from '@chamvi/http-kit';
import { Permission } from '@chamvi/access';
import { shortId } from '../../runs/helpers/index.ts';
import type {
    ApprovalLink,
    DecidedApproval,
    LinkNotice,
    LinkedApprovalState,
} from '../types.ts';
import { approvalWaitOf } from './wait.ts';

/** The first non-empty string of a query value (a repeated key is an array). */
function firstToken(value: unknown): string | undefined {
    const values: unknown[] = Array.isArray(value) ? value : [value];

    return values.find((item): item is string => typeof item === 'string' && item.length > 0);
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
