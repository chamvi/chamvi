/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { Permission, allPermissions } from '@chamvi/access';
import type { Run, Step } from '@chamvi/core';
import { serializeRun, serializeStep } from '../../../src/runs/helpers.ts';
import type { HttpAgents } from '../../../src/app/types.ts';

const NO_AGENTS: HttpAgents = {
    get: () => undefined,
    list: () => [],
    names: () => [],
};

describe('serializeRun', () => {
    it('serializes the first untrusted source and time on the wire', () => {
        const now = new Date('2026-10-30T10:00:00.000Z');
        const run: Run = {
            id: 'r1',
            agent: 'gate',
            status: 'waiting',
            taint: { at: now, source: 'web.fetch' },
            trigger: {
                id: 't1',
                agent: 'gate',
                trigger: 'http',
                channel: 'http',
                payload: undefined,
                receivedAt: now,
            },
            usage: { inputTokens: 0, outputTokens: 0 },
            createdAt: now,
            updatedAt: now,
        };
        const view = serializeRun(run, NO_AGENTS);

        expect(view.taint).toEqual(run.taint);
        expect(JSON.parse(JSON.stringify(view)).taint).toEqual({
            at: '2026-10-30T10:00:00.000Z',
            source: 'web.fetch',
        });
    });

    it('drops the claim, keeps every other key and adds agentPrivate', () => {
        const now = new Date(0);
        const run: Run = {
            id: 'r1',
            agent: 'gate',
            status: 'waiting',
            trigger: {
                id: 't1',
                agent: 'gate',
                trigger: 'http',
                channel: 'http',
                payload: undefined,
                receivedAt: now,
            },
            usage: { inputTokens: 1, outputTokens: 1 },
            waiting: {
                kind: 'approval',
                id: 'a1',
                approvalId: 'a1',
                toolName: 'deploy',
                toolCallId: 'c1',
                title: 'Deploy?',
                expiresAt: now,
            },
            claim: { owner: 'h-1', expiresAt: now },
            createdAt: now,
            updatedAt: now,
        };
        const view = serializeRun(run, NO_AGENTS);

        expect(view).not.toHaveProperty('claim');
        // an agent the app does not hold counts as private
        expect(view).toEqual({
            ...run, 
            claim: undefined, 
            agentPrivate: true, 
        });
        expect(Object.keys(view)).toEqual([...Object.keys(run).filter((key) => key !== 'claim'), 'agentPrivate']);
        expect(view.waiting?.id).toBe('a1');
    });

    it('drops the invoker bindings and keeps id, kind and name', () => {
        const now = new Date(0);
        const run: Run = {
            id: 'r1',
            agent: 'gate',
            status: 'queued',
            trigger: {
                id: 't1',
                agent: 'gate',
                trigger: 'http',
                channel: 'http',
                payload: undefined,
                invoker: {
                    id: 'u1',
                    kind: 'authup',
                    name: 'alice',
                    bindings: allPermissions(),
                },
                receivedAt: now,
            },
            usage: { inputTokens: 0, outputTokens: 0 },
            createdAt: now,
            updatedAt: now,
        };
        const view = serializeRun(run, NO_AGENTS);

        expect(view.trigger.invoker).toEqual({
            id: 'u1',
            kind: 'authup',
            name: 'alice',
        });
        expect(run.trigger.invoker?.bindings).toEqual(allPermissions());
    });
});

describe('serializeStep', () => {
    const now = new Date(0);
    const base: Step = {
        runId: 'r1',
        index: 2,
        kind: 'wait',
        name: 'deploy',
        startedAt: now,
        finishedAt: now,
    };

    it('drops the approver bindings of a wait step', () => {
        const step: Step = {
            ...base,
            output: {
                approvalId: 'a1',
                approved: true,
                approver: {
                    id: 'u1',
                    kind: 'token',
                    bindings: [{ permission: { name: Permission.AGENT_APPROVE } }],
                },
            },
        };

        expect(serializeStep(step).output).toEqual({
            approvalId: 'a1',
            approved: true,
            approver: { id: 'u1', kind: 'token' },
        });

        const { approver } = step.output as { approver: { bindings: unknown[] } };

        expect(approver.bindings).toEqual([{ permission: { name: Permission.AGENT_APPROVE } }]);
    });

    it('leaves other steps and a wait step without approver as they are', () => {
        const wait: Step = { ...base, output: { approvalId: 'a1', approved: false } };

        expect(serializeStep(wait)).toBe(wait);

        const toolStep: Step = {
            ...base,
            kind: 'tool',
            output: { approver: { bindings: [{ permission: { name: 'x' } }] } },
        };

        expect(serializeStep(toolStep)).toBe(toolStep);
    });
});
