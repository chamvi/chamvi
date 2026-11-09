/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunWire, StepWire } from '@chamvi/ui-kit';

export function wireRun(overrides: Partial<RunWire> = {}): RunWire {
    return {
        id: 'r1',
        agent: 'deploy',
        status: 'running',
        trigger: {
            id: 't1',
            agent: 'deploy',
            trigger: 'http',
            channel: 'http',
            payload: { env: 'prod' },
            receivedAt: '2026-10-21T10:00:00.000Z',
        },
        usage: { inputTokens: 0, outputTokens: 0 },
        createdAt: '2026-10-21T10:00:00.000Z',
        updatedAt: '2026-10-21T10:00:00.000Z',
        ...overrides,
    } as RunWire;
}

export function wireStep(index: number, kind: StepWire['kind'] = 'llm', overrides: Partial<StepWire> = {}): StepWire {
    return {
        runId: 'r1',
        index,
        kind,
        startedAt: '2026-10-21T10:00:00.000Z',
        finishedAt: '2026-10-21T10:00:01.000Z',
        ...overrides,
    };
}
