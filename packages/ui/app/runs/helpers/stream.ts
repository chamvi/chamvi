/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import type { RunWire, StepWire } from '@chamvi/http-kit';
import type { RunStreamEvent } from '../../sse/types.ts';
import { SETTLED_STATUSES } from '../constants.ts';
import type { LiveText, RunDetailState } from '../types.ts';

/** Model steps that landed: each one ends in exactly one `llm` step, in order. */
export function landedModelSteps(steps: readonly StepWire[]): number {
    return steps.filter((step) => step.kind === 'llm').length;
}

function pruneLive(live: Record<number, LiveText>, landed: number): Record<number, LiveText> {
    const next: Record<number, LiveText> = {};

    for (const [key, value] of Object.entries(live)) {
        if (Number(key) >= landed) {
            next[Number(key)] = value;
        }
    }

    return next;
}

/**
 * Folds one stream event into the run view: a run replaces (a settled one
 * drops the live text); a step is inserted by `index` (a known index is
 * ignored, so a reconnect never duplicates) and drops the live text of the
 * model steps that landed; a delta appends to its model step unless that
 * step landed already.
 */
export function mergeRunEvent(state: RunDetailState, event: RunStreamEvent): RunDetailState {
    if (event.type === 'run') {
        return {
            ...state,
            run: event.run,
            live: SETTLED_STATUSES.includes(event.run.status) ? {} : state.live,
        };
    }

    if (event.type === 'step') {
        const alreadyHasStep = state.steps.some((step) => step.index === event.step.index);

        if (alreadyHasStep) {
            return state;
        }

        const steps = [...state.steps, event.step].sort((a, b) => a.index - b.index);

        return {
            ...state,
            steps,
            live: pruneLive(state.live, landedModelSteps(steps)),
        };
    }

    if (event.step < landedModelSteps(state.steps)) {
        return state;
    }

    const current = state.live[event.step] ?? { text: '', reasoning: '' };

    return {
        ...state,
        live: {
            ...state.live,
            [event.step]: {
                text: event.kind === 'text' ? current.text + event.text : current.text,
                reasoning: event.kind === 'reasoning' ? current.reasoning + event.text : current.reasoning,
            },
        },
    };
}

export function lastStepIndex(steps: readonly StepWire[]): number | undefined {
    if (steps.length === 0) {
        return undefined;
    }

    return Math.max(...steps.map((step) => step.index));
}

export function isSettled(run: RunWire): boolean {
    return SETTLED_STATUSES.includes(run.status);
}
