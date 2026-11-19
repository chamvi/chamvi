/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import { describe, expect, it } from 'vitest';
import {
    canCancel,
    childRole,
    dispatchCallout,
    formatDuration,
    formatTokens,
    httpUrl,
    lastStepIndex,
    mergeRunEvent,
    parentOf,
    remoteCallout,
    remoteLabel,
    shortId,
    subtreeTotal,
    waitToolName,
} from '../../../../app/runs/helpers/index.ts';
import type { RunDetailState } from '../../../../app/runs/types.ts';
import { approvalWaitOf } from '../../../../app/approvals/helpers/index.ts';
import { ALL, allowedOf } from '../../../utils/permissions.ts';
import { wireRun, wireStep } from '../../../utils/runs.ts';

function state(steps = [wireStep(0), wireStep(1, 'tool')]): RunDetailState {
    return {
        run: wireRun(),
        steps,
        live: {},
    };
}

describe('mergeRunEvent', () => {
    it('replaces the run', () => {
        const next = mergeRunEvent(state(), { type: 'run', run: wireRun({ status: 'completed' }) });

        expect(next.run.status).toBe('completed');
    });

    it('inserts a step by index and ignores a step it already has', () => {
        const base = state([wireStep(0), wireStep(2, 'tool')]);
        const inserted = mergeRunEvent(base, { type: 'step', step: wireStep(1, 'tool') });

        expect(inserted.steps.map((s) => s.index)).toEqual([0, 1, 2]);

        const again = mergeRunEvent(inserted, { type: 'step', step: wireStep(1, 'tool', { name: 'other' }) });

        expect(again).toBe(inserted);
    });

    it('appends deltas and drops them when their step lands', () => {
        // two llm steps landed (model steps 0 and 1), model step 2 is live
        let s = state([wireStep(0), wireStep(1, 'tool'), wireStep(2)]);

        s = mergeRunEvent(s, {
            type: 'delta',
            step: 2,
            kind: 'text',
            text: 'Hel',
        });
        s = mergeRunEvent(s, {
            type: 'delta',
            step: 2,
            kind: 'reasoning',
            text: 'think',
        });
        s = mergeRunEvent(s, {
            type: 'delta',
            step: 2,
            kind: 'text',
            text: 'lo',
        });
        expect(s.live).toEqual({ 2: { text: 'Hello', reasoning: 'think' } });
        s = mergeRunEvent(s, { type: 'step', step: wireStep(3) });
        expect(s.live).toEqual({});
    });

    it('ignores a delta for a finished step', () => {
        const s = mergeRunEvent(state(), {
            type: 'delta',
            step: 0,
            kind: 'text',
            text: 'late',
        });

        expect(s.live).toEqual({});
    });

    it('drops the live text once the run settled', () => {
        let s = mergeRunEvent(state(), {
            type: 'delta',
            step: 1,
            kind: 'text',
            text: 'x',
        });

        s = mergeRunEvent(s, { type: 'run', run: wireRun({ status: 'failed' }) });
        expect(s.live).toEqual({});
    });
});

describe('lastStepIndex', () => {
    it('is the highest index, undefined without steps', () => {
        expect(lastStepIndex([])).toBeUndefined();
        expect(lastStepIndex([wireStep(0), wireStep(3), wireStep(2)])).toBe(3);
    });
});

describe('canCancel', () => {
    it('follows status and chamvi_run_cancel', () => {
        for (const status of ['queued', 'running', 'waiting', 'interrupted'] as const) {
            expect(canCancel(wireRun({ status }), allowedOf(Permission.RUN_CANCEL)), status).toBe(true);
            expect(canCancel(wireRun({ status }), allowedOf(Permission.RUN_READ)), status).toBe(false);
            expect(canCancel(wireRun({ status }), allowedOf()), status).toBe(false);
        }

        for (const status of ['completed', 'failed', 'cancelled'] as const) {
            expect(canCancel(wireRun({ status }), allowedOf(...ALL)), status).toBe(false);
        }
    });
});

describe('format', () => {
    it('distinguishes UUID v7 runs with the same timestamp prefix', () => {
        expect([
            '019a5555-1234-7abc-8123-456789abcdef',
            '019a5555-1234-7abc-8123-456789abcdee',
        ].map(shortId)).toEqual(['89abcdef', '89abcdee']);
    });


    it('formats tokens and durations', () => {
        expect(formatTokens(950)).toBe('950');
        expect(formatTokens(14_210)).toBe('14.2k');
        expect(formatTokens(2_500_000)).toBe('2.5M');
        expect(formatTokens(200_000)).toBe('200k');
        expect(formatTokens(1_000_000)).toBe('1M');
        expect(formatDuration(48_000)).toBe('0:48');
        expect(formatDuration(134_000)).toBe('2:14');
        expect(formatDuration(3_725_000)).toBe('1:02:05');
    });
});

describe('parentOf', () => {
    it('parentOf labels a dispatch parent "dispatched from"', () => {
        const base = wireRun();
        const run = wireRun({
            trigger: {
                ...base.trigger,
                channel: 'agent',
                trigger: 'handoff',
                parent: {
                    kind: 'dispatch',
                    runId: 'p1',
                    agent: 'deploy',
                    role: 'default',
                    depth: 1,
                },
            },
        });

        expect(parentOf(run)).toEqual({ runId: 'p1', label: 'dispatched from' });
    });

    it('names a peer parent <peer>/<agent> with its origin, unlinked', () => {
        const base = wireRun();
        const parent = {
            kind: 'peer' as const,
            peer: 'dev',
            runId: 'remote-p1',
            standIn: 'stand-in-1',
            agent: 'maintainer',
            role: 'notify',
            depth: 1,
        };

        expect(parentOf(wireRun({
            trigger: {
                ...base.trigger, 
                channel: 'agent', 
                parent: { ...parent, origin: 'Ann' }, 
            }, 
        }))).toEqual({
            runId: 'remote-p1',
            label: 'from dev/maintainer (Ann)',
            remote: true,
        });
        expect(parentOf(wireRun({
            trigger: {
                ...base.trigger, 
                channel: 'agent', 
                parent, 
            }, 
        }))).toEqual({
            runId: 'remote-p1',
            label: 'from dev/maintainer',
            remote: true,
        });
    });

    it('is undefined without a parent', () => {
        expect(parentOf(wireRun())).toBeUndefined();
    });

    it('is undefined for a kind it does not know', () => {
        const base = wireRun();
        const run = wireRun({ trigger: { ...base.trigger, parent: { kind: 'other', runId: 'p1' } as never } });

        expect(parentOf(run)).toBeUndefined();
    });
});

describe('subtreeTotal', () => {
    it('subtreeTotal sums tokens', () => {
        expect(subtreeTotal(wireRun({ subtreeUsage: { inputTokens: 120, outputTokens: 30 } }))).toBe(150);
    });

    it('is undefined without subtree usage', () => {
        expect(subtreeTotal(wireRun())).toBeUndefined();
    });
});

describe('dispatchCallout', () => {
    it('dispatchCallout names the run count', () => {
        const waiting = {
            kind: 'dispatch' as const,
            id: '0:c1:w0',
            toolName: 'fan_out',
            toolCallId: 'c1',
            runIds: ['c1', 'c2', 'c2'],
            expiresAt: '2026-10-22T10:00:00.000Z',
        };

        expect(dispatchCallout(wireRun({ status: 'waiting', waiting }))).toBe('Waits for 2 dispatched runs');
        expect(dispatchCallout(wireRun({ status: 'waiting', waiting: { ...waiting, runIds: ['c1'] } }))).toBe('Waits for 1 dispatched run');
    });

    it('is undefined for an approval wait or a run that does not wait', () => {
        expect(dispatchCallout(wireRun())).toBeUndefined();
        expect(dispatchCallout(wireRun({
            status: 'waiting',
            waiting: {
                kind: 'approval',
                id: '0:c1:0',
                approvalId: '0:c1:0',
                toolName: 'deploy',
                toolCallId: 'c1',
                title: 'Deploy?',
                expiresAt: '2026-10-22T10:00:00.000Z',
            } as never,
        }))).toBeUndefined();
    });
});

describe('childRole', () => {
    it('reads the dispatch role, else the subscription id', () => {
        const base = wireRun();

        expect(childRole(wireRun({
            trigger: {
                ...base.trigger,
                trigger: 'review',
                parent: {
                    kind: 'dispatch',
                    runId: 'p1',
                    agent: 'deploy',
                    role: 'review',
                    depth: 1,
                },
            },
        }))).toBe('review');
        expect(childRole(base)).toBe('http');
    });
});

describe('waitToolName', () => {
    it('names the tool of an approval or dispatch wait, none for a remote wait', () => {
        const expiresAt = '2026-01-01T00:00:00.000Z';

        expect(waitToolName(wireRun({
            waiting: {
                kind: 'dispatch',
                id: '1:c2:w0',
                toolName: 'review',
                toolCallId: 'c2',
                runIds: ['c1'],
                expiresAt,
            },
        }))).toBe('review');
        expect(waitToolName(wireRun({
            waiting: {
                kind: 'remote',
                id: 'remote',
                peer: 'dev',
                agent: 'developer',
                remoteRunId: 'x1',
                expiresAt,
            },
        }))).toBeUndefined();
        expect(waitToolName(wireRun())).toBeUndefined();
    });
});

/** A `javascript:` URL, built so no literal script URL sits in the source. */
const SCRIPT_URL = ['javascript', 'alert(1)'].join(':');

describe('remote waits', () => {
    const expiresAt = '2026-01-01T00:00:00.000Z';

    function standIn(remote?: {
        status: 'waiting';
        approval?: {
            runId: string;
            approvalId: string;
            title: string;
            url?: string
        }
    }) {
        return wireRun({
            status: 'waiting',
            waiting: {
                kind: 'remote',
                id: 'remote',
                peer: 'dev',
                agent: 'developer',
                remoteRunId: 'r-42',
                expiresAt,
                ...(remote ? { remote } : {}),
            },
        });
    }

    it('labels a remote agent as <peer>/<agent>', () => {
        expect(remoteLabel({ peer: 'dev', agent: 'developer' })).toBe('dev/developer');
    });

    it('shows the remote agent and the remote run id of a stand-in', () => {
        expect(remoteCallout(standIn())).toEqual({ target: 'dev/developer', remoteRunId: 'r-42' });
        expect(remoteCallout(standIn({ status: 'waiting' }))).toEqual({ target: 'dev/developer', remoteRunId: 'r-42' });
    });

    it('adds the remote approval title and the peer link', () => {
        const run = standIn({
            status: 'waiting',
            approval: {
                runId: 'r-43',
                approvalId: '1:c1:0',
                title: 'Push the branch?',
                url: 'https://dev.example.com/ui/approvals?run=r-43&approval=1%3Ac1%3A0',
            },
        });

        expect(remoteCallout(run)).toEqual({
            target: 'dev/developer',
            remoteRunId: 'r-42',
            approval: {
                title: 'Push the branch?',
                url: 'https://dev.example.com/ui/approvals?run=r-43&approval=1%3Ac1%3A0',
            },
        });
    });

    it('drops a peer link that is not http(s)', () => {
        const run = standIn({
            status: 'waiting',
            approval: {
                runId: 'r-43',
                approvalId: '1:c1:0',
                title: 'Push the branch?',
                url: SCRIPT_URL,
            },
        });

        expect(remoteCallout(run)?.approval).toEqual({ title: 'Push the branch?', url: undefined });
    });

    it('is undefined for a run that is not waiting on a remote run', () => {
        expect(remoteCallout(wireRun())).toBeUndefined();
        expect(remoteCallout({ ...standIn(), status: 'completed' })).toBeUndefined();
    });

    it('keeps a stand-in out of the approvals inbox', () => {
        const run = standIn({
            status: 'waiting',
            approval: {
                runId: 'r-43',
                approvalId: '1:c1:0',
                title: 'Push the branch?',
            },
        });

        expect(approvalWaitOf(run)).toBeUndefined();
    });
});

describe('httpUrl', () => {
    it('keeps http and https URLs only', () => {
        expect(httpUrl('https://peer.example.com/ui/approvals?run=1')).toBe('https://peer.example.com/ui/approvals?run=1');
        expect(httpUrl('http://localhost:3000/x')).toBe('http://localhost:3000/x');
        expect(httpUrl(SCRIPT_URL)).toBeUndefined();
        expect(httpUrl('data:text/html,hi')).toBeUndefined();
        expect(httpUrl('/ui/approvals')).toBeUndefined();
        expect(httpUrl('')).toBeUndefined();
        expect(httpUrl(undefined)).toBeUndefined();
    });
});
