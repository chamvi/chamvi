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
        id: `019a0000-0000-7000-8000-${String(index).padStart(12, '0')}`,
        runId: 'r1',
        index,
        kind,
        startedAt: '2026-10-21T10:00:00.000Z',
        finishedAt: '2026-10-21T10:00:01.000Z',
        ...overrides,
    };
}

/** A run-list query's filter as the view filter it was built from (`toRunQuery`), its createdAt bounds as sent (instants). */
export type QueriedRunFilter = Omit<RunListFilter, 'from' | 'to'> & { createdAt?: { gte?: string; lte?: string } };

/** The view filter a run-list query was built from (`toRunQuery`), for fakes that answer by filter. */
export function filterOf(query: RunListQuery = {}): QueriedRunFilter {
    const input = query as {
        filters?: {
            value?: Array<{
                field: string; 
                operator: string; 
                value: unknown 
            }> 
        };
        pagination?: Record<string, number> 
    };
    const output: Record<string, unknown> = { ...input.pagination };

    for (const leaf of input.filters?.value ?? []) {
        if (leaf.field === 'createdAt') {
            output.createdAt = { ...(output.createdAt as object | undefined), [leaf.operator]: leaf.value };
        } else {
            output[leaf.field] = leaf.value;
        }
    }

    return output as QueriedRunFilter;
}

/** A fake `run.getMany` answering by the view filter. */
export function runsBy(answer: (filter: QueriedRunFilter) => Promise<RunPage> | RunPage): (query?: RunListQuery) => Promise<RunPage> {
    return async (query) => answer(filterOf(query));
}
