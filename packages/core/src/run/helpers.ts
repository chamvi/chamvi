/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import { isFilter, isFilters } from '@rapiq/core';
import type { ICondition, IFilters, ISort } from '@rapiq/core';
import { normalizeEnvelope, normalizeWaitPoint } from '@chamvi/core-kit';
import type { Run, WaitPoint } from '@chamvi/core-kit';

/** The run field a listing selects a wait point kind by (`Run.waiting.kind`). */
const WAITING_FIELD = 'waiting';

/** Whether any filter below `condition` (itself included) is on `field`. */
function hasField(condition: ICondition, field: string): boolean {
    if (isFilter(condition)) {
        return condition.field === field;
    }

    return isFilters(condition) && condition.value.some((child) => hasField(child, field));
}

/**
 * The top-level conditions of a listing's filters without its `waiting`
 * filter, and the wait point kind that filter selects: `eq` with
 * `approval` or `dispatch`, given once and joined with `and`; a `waiting`
 * condition of any other shape is a ValidationError (the field is a JSON
 * document, no column a query compares).
 */
export function splitWaitKind(filters: IFilters): { conditions: ICondition[]; waitKind?: WaitPoint['kind'] } {
    const children = filters.operator === 'and' ? filters.value : [filters];
    const conditions: ICondition[] = [];
    let waitKind: WaitPoint['kind'] | undefined;

    for (const child of children) {
        if (isFilter(child) && child.field === WAITING_FIELD) {
            if (waitKind !== undefined || child.operator !== 'eq' || (child.value !== 'approval' && child.value !== 'dispatch')) {
                throw new ValidationError('A run listing selects one wait point kind: waiting equal to approval or dispatch.');
            }

            waitKind = child.value;
        } else if (hasField(child, WAITING_FIELD)) {
            throw new ValidationError('A run listing selects one wait point kind: waiting equal to approval or dispatch.');
        } else {
            conditions.push(child);
        }
    }

    return { conditions, ...(waitKind !== undefined ? { waitKind } : {}) };
}

/**
 * A listing's sorts, then `id` in the direction of the last sort, so equal
 * values page stably: `createdAt`, then `id`, ascending without sorts.
 */
export function withIdTieBreak(sorts: readonly ISort[]): Record<string, 'ASC' | 'DESC'> {
    if (sorts.length === 0) {
        return { createdAt: 'ASC', id: 'ASC' };
    }

    const record: Record<string, 'ASC' | 'DESC'> = {};

    for (const sort of sorts) {
        record[sort.name] = sort.operator;
    }

    if (!Object.hasOwn(record, 'id')) {
        record.id = sorts.at(-1)!.operator;
    }

    return record;
}

/** The wait id of a stored wait point: `id`, else (a legacy approval wait point) `approvalId`. */
export function waitIdOf(waiting: WaitPoint | undefined): string | undefined {
    if (!waiting) {
        return undefined;
    }

    // a legacy approval wait point was stored without `id`
    const { id } = waiting as { id?: unknown };

    if (typeof id === 'string') {
        return id;
    }

    return waiting.kind === 'approval' ? waiting.approvalId : undefined;
}

/**
 * Rejects with the abort reason as soon as `signal` aborts, even if `work` ignores the signal.
 * `work` always gets a handler, so its later rejection is never unhandled.
 */
export function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
        work.catch(() => {});

        return Promise.reject(signal.reason);
    }

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason);

        signal.addEventListener('abort', onAbort, { once: true });
        work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}

/**
 * A run as the service returns it: a legacy envelope (`source`, `thread`)
 * and an approval wait point without `id` in the current shape, a
 * property set to `undefined` left out. The stored row is not changed.
 */
export function readRun(run: Run): Run {
    const output: Run = { ...run, trigger: normalizeEnvelope(run.trigger as unknown as Record<string, unknown>) };

    if (output.waiting) {
        output.waiting = normalizeWaitPoint(output.waiting as unknown as Record<string, unknown>);
    }

    for (const key of Object.keys(output) as (keyof Run)[]) {
        if (output[key] === undefined) {
            delete output[key];
        }
    }

    return output;
}
