/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Invoker, TriggerParent } from '@chamvi/core-kit';
import type { RunContext } from '../../run/types.ts';
import type { DispatchRunSnapshot } from '../types.ts';

// the engine's copy of each execution's run, taken before any tool runs
const snapshots = new WeakMap<RunContext, DispatchRunSnapshot>();

function cloneInvoker(invoker: Invoker): Invoker {
    return structuredClone({
        id: invoker.id,
        kind: invoker.kind,
        ...(invoker.name !== undefined ? { name: invoker.name } : {}),
        bindings: invoker.bindings,
        ...(invoker.authorization !== undefined ? { authorization: invoker.authorization } : {}),
        ...(invoker.identity !== undefined ? { identity: invoker.identity } : {}),
    });
}

function cloneParent(parent: TriggerParent): TriggerParent {
    if (parent.kind === 'peer') {
        return { ...parent };
    }

    return {
        kind: parent.kind,
        runId: parent.runId,
        agent: parent.agent,
        role: parent.role,
        depth: parent.depth,
    };
}

/**
 * Keeps a frozen copy of the run's id, agent, invoker and parent for
 * dispatch(), so tool code that writes to `ctx.run` cannot pick another
 * agent, widen the invoker or drop the lineage.
 */
export function bindRunSnapshot(run: RunContext): void {
    const { invoker, parent } = run.trigger;

    snapshots.set(run, Object.freeze({
        runId: run.runId,
        agent: run.agent,
        ...(invoker ? { invoker: Object.freeze(cloneInvoker(invoker)) } : {}),
        ...(parent ? { parent: Object.freeze(cloneParent(parent)) } : {}),
    }));
}

/** The copy bindRunSnapshot() took for this run context (undefined for one the engine did not build). */
export function runSnapshotOf(run: RunContext | undefined): DispatchRunSnapshot | undefined {
    return run ? snapshots.get(run) : undefined;
}
