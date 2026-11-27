/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Run } from '@chamvi/core-kit';
import { isObject } from 'smob';
import type { DispatchOutcome, DispatchWaitRecord } from '../types.ts';
import { isRunSettled, toDispatchOutcome } from './outcome.ts';

/** The `dispatch-count:<runId>:<agent>:<role>` record: the slots spent and the calls (call hashes) they were spent on. */
export function readDispatchCount(value: unknown): { count: number, calls: string[] } {
    if (!isObject(value)) {
        return { count: 0, calls: [] };
    }

    const count = typeof value.count === 'number' ? value.count : 0;
    const calls = Array.isArray(value.calls) ? value.calls.filter((c): c is string => typeof c === 'string') : [];

    return { count, calls };
}

/** The `dispatch-children:<runId>` record: the ids of every run this run dispatched (deduplicated ones too). */
export function readDispatchChildren(value: unknown): string[] {
    if (!isObject(value) || !Array.isArray(value.runIds)) {
        return [];
    }

    return value.runIds.filter((id): id is string => typeof id === 'string');
}

/**
 * The record of `runIds` (duplicates kept, in order) when every one of them
 * is settled in `runs`; undefined while one is not (or is missing).
 */
export function toWaitRecord(runIds: readonly string[], runs: readonly Run[]): DispatchWaitRecord | undefined {
    const byId = new Map(runs.map((run) => [run.id, run]));
    const outcomes: DispatchOutcome[] = [];
    const tainted: string[] = [];

    for (const id of runIds) {
        const run = byId.get(id);

        if (!run || !isRunSettled(run)) {
            return undefined;
        }

        outcomes.push(toDispatchOutcome(run));

        if (run.taint && !tainted.includes(id)) {
            tainted.push(id);
        }
    }

    return { outcomes, tainted };
}

/** A stored `dispatch-wait:` record (a malformed one reads as no outcomes). */
export function readWaitRecord(value: unknown): DispatchWaitRecord {
    if (!isObject(value)) {
        return { outcomes: [], tainted: [] };
    }

    return {
        outcomes: Array.isArray(value.outcomes) ? value.outcomes as DispatchOutcome[] : [],
        tainted: Array.isArray(value.tainted) ? value.tainted.filter((id): id is string => typeof id === 'string') : [],
    };
}

/**
 * The record of an expired wait on `runIds` (duplicates kept, in order): a
 * settled run keeps its outcome (a cancel the expiry made reads
 * `cancelled`), any other (still running, or missing) is `timeout` with `error`.
 */
export function toExpiredRecord(
    runIds: readonly string[],
    runs: readonly Run[],
    error: { code: string; message: string },
): DispatchWaitRecord {
    const byId = new Map(runs.map((run) => [run.id, run]));
    const outcomes: DispatchOutcome[] = [];
    const tainted: string[] = [];

    for (const id of runIds) {
        const run = byId.get(id);

        if (run && isRunSettled(run)) {
            outcomes.push(toDispatchOutcome(run));
        } else {
            outcomes.push({
                runId: id,
                agent: run?.agent ?? '',
                role: run ? run.trigger.parent?.role ?? run.trigger.trigger : '',
                status: 'timeout',
                error: { ...error },
            });
        }

        if (run?.taint && !tainted.includes(id)) {
            tainted.push(id);
        }
    }

    return { outcomes, tainted };
}
