/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    RunListQuery,
    RunPage,
    RunWire,
    StepWire,
} from '@chamvi/http-kit';
import type { RunListFilter } from '../../app/runs/types.ts';

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

/** The view filter a run-list query was built from (`toRunQuery`), for fakes that answer by filter. */
export function filterOf(query: RunListQuery = {}): RunListFilter {
    const input = query as { filters?: Record<string, unknown>; pagination?: Record<string, number> };

    return { ...input.filters, ...input.pagination } as RunListFilter;
}

/** A fake `run.getMany` answering by the view filter. */
export function runsBy(answer: (filter: RunListFilter) => Promise<RunPage> | RunPage): (query?: RunListQuery) => Promise<RunPage> {
    return async (query) => answer(filterOf(query));
}
