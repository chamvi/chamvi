/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunWire, StepWire } from '@chamvi/http-kit';
import { Permission } from '@chamvi/access';
import type { RunStreamEvent } from '../sse/types.ts';
import { CANCELABLE_STATUSES, PARENT_LABELS, SETTLED_STATUSES } from './constants.ts';

/** Live model output per model step (the checkpoint index a delta names). */
export type LiveText = { text: string; reasoning: string };

export type RunDetailState = {
    run: RunWire;
    steps: StepWire[];
    live: Record<number, LiveText>;
};

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

/** Cancel shows for a run that can still stop while the session is allowed `chamvi_run_cancel`. */
export function canCancel(run: RunWire, allowed: (name: string) => boolean): boolean {
    return CANCELABLE_STATUSES.includes(run.status) && allowed(Permission.RUN_CANCEL);
}

/**
 * The run this one was dispatched from, with the run page's label; undefined
 * for none or an unknown kind. A peer parent is a run of another app
 * (`remote`, no local page), labelled `from <peer>/<agent>` with the origin
 * name when the peer sent one.
 */
export function parentOf(run: RunWire): {
    runId: string; 
    label: string; 
    remote?: true 
} | undefined {
    const { parent } = run.trigger;

    if (!parent || typeof parent.runId !== 'string') {
        return undefined;
    }

    if (parent.kind === 'peer') {
        const origin = parent.origin !== undefined ? ` (${parent.origin})` : '';

        return {
            runId: parent.runId, 
            label: `from ${parent.peer}/${parent.agent}${origin}`, 
            remote: true, 
        };
    }

    const label = Object.hasOwn(PARENT_LABELS, parent.kind) ? PARENT_LABELS[parent.kind] : undefined;

    return label ? { runId: parent.runId, label } : undefined;
}

/** The tokens of every run below this one (`subtreeUsage`, input plus output); undefined without any. */
export function subtreeTotal(run: RunWire): number | undefined {
    return run.subtreeUsage ? run.subtreeUsage.inputTokens + run.subtreeUsage.outputTokens : undefined;
}

/** The run page's line for a dispatch wait (distinct runs); undefined for any other run. */
export function dispatchCallout(run: RunWire): string | undefined {
    if (run.status !== 'waiting' || run.waiting?.kind !== 'dispatch') {
        return undefined;
    }

    const count = new Set(run.waiting.runIds).size;

    return `Waits for ${count} dispatched ${count === 1 ? 'run' : 'runs'}`;
}

/** The dispatch role a child run was started through, else its subscription id. */
export function childRole(run: RunWire): string {
    return run.trigger.parent?.role ?? run.trigger.trigger;
}

export function isSettled(run: RunWire): boolean {
    return SETTLED_STATUSES.includes(run.status);
}

export function formatTokens(count: number): string {
    if (count >= 1_000_000) {
        return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    }

    if (count >= 1000) {
        return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }

    return String(count);
}

export function formatDuration(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (value: number) => String(value).padStart(2, '0');

    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** How long a run took, or runs so far. */
export function runDuration(run: RunWire, now: number): number | undefined {
    if (!run.startedAt) {
        return undefined;
    }

    const end = run.finishedAt ? Date.parse(run.finishedAt) : now;

    return end - Date.parse(run.startedAt);
}

/** The tool a run's wait point paused in; none for a remote wait. */
export function waitToolName(run: RunWire): string | undefined {
    return run.waiting && run.waiting.kind !== 'remote' ? run.waiting.toolName : undefined;
}

/** A remote agent as `<peer>/<agent>`: the peer and the agent's name there. */
export function remoteLabel(remote: { peer: string; agent: string }): string {
    return `${remote.peer}/${remote.agent}`;
}

/** The URL when it is an absolute http(s) URL, else undefined: a peer's link is never rendered otherwise. */
export function httpUrl(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    try {
        const url = new URL(value);

        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The run page's view of a stand-in's remote wait: `<peer>/<agent>`, the
 * remote run id and, while the last poll saw one, the remote approval's title
 * and the peer's link (http(s) only); undefined for any other run.
 */
export function remoteCallout(run: RunWire): {
    target: string;
    remoteRunId: string;
    approval?: { title: string; url?: string };
} | undefined {
    if (run.status !== 'waiting' || run.waiting?.kind !== 'remote') {
        return undefined;
    }

    const { waiting } = run;
    const approval = waiting.remote?.approval;

    return {
        target: remoteLabel(waiting),
        remoteRunId: waiting.remoteRunId,
        ...(approval ? { approval: { title: approval.title, url: httpUrl(approval.url) } } : {}),
    };
}

/** Use the entropy tail so nearby UUID v7 runs have distinguishable short labels. */
export function shortId(id: string): string {
    return id.slice(-8);
}

/** The JSON of a value, pretty, for a code block; `undefined` reads as `—`. */
export function toJson(value: unknown): string {
    if (value === undefined) {
        return '—';
    }

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}
