/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Invoker, Run, Step } from '@chamvi/store';
import { isObject } from 'smob';
import { agentResource } from '../../auth/helpers/index.ts';
import type { HttpAgents } from '../../app/types.ts';
import type { InvokerView, RunView } from '../types.ts';

/** An invoker without its `bindings` and `authorization`: a reader must not learn another principal's grants. */
function viewInvoker(invoker: Invoker): InvokerView {
    return {
        id: invoker.id,
        kind: invoker.kind,
        ...(invoker.name !== undefined ? { name: invoker.name } : {}),
    };
}

/**
 * Drops the internal claim, conversation binding and invoker bindings,
 * and adds `agentPrivate`: the `private` the server checks the run's agent
 * with (`agentResource()`; an agent the app does not hold counts as private).
 */
export function serializeRun(run: Run, agents: HttpAgents): RunView {
    const view = { ...run };

    delete view.claim;
    delete view.conversation;

    return {
        ...view,
        trigger: run.trigger.invoker ? { ...run.trigger, invoker: viewInvoker(run.trigger.invoker) } : run.trigger,
        agentPrivate: agentResource(run.agent, agents.get(run.agent)).private,
    };
}

/** A step as it leaves the package: a `wait` step's approver without its `bindings`. */
export function serializeStep(step: Step): Step {
    if (step.kind !== 'wait' || !isObject(step.output)) {
        return step;
    }

    const { approver } = step.output as { approver?: unknown };

    if (!isObject(approver)) {
        return step;
    }

    return { ...step, output: { ...step.output, approver: viewInvoker(approver as Invoker) } };
}
