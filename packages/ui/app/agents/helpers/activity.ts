/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import type {
    AgentWire,
    RunPage,
    RunWire,
    ScheduleWire,
} from '@chamvi/http-kit';
import { shortId } from '../../runs/helpers/index.ts';
import { ACTIVITY_WINDOW_MS } from '../constants.ts';
import type { Activity, AgentRollup } from '../types.ts';
import { nextFireOf } from './listing.ts';

const tokensOf = (run: RunWire) => run.usage.inputTokens + run.usage.outputTokens;

/**
 * The runs of the last 24 h among `runs` (newest first, at most `limit` read).
 * When the read hit the limit inside the window, `saturated` says the count is a floor.
 */
export function summarizeActivity(runs: readonly RunWire[], now: number, limit: number): Activity {
    const start = now - ACTIVITY_WINDOW_MS;
    const inside = runs.filter((run) => Date.parse(run.createdAt) >= start);
    const failed = inside.filter((run) => run.status === 'failed');
    const activity: Activity = {
        count: inside.length,
        saturated: runs.length >= limit && inside.length === runs.length,
        marks: inside.map((run) => ({
            id: run.id,
            status: run.status,
            left: Math.min(99.4, Math.max(0.6, (Date.parse(run.createdAt) - start) / ACTIVITY_WINDOW_MS * 100)),
        })),
        failed: failed.length,
        tokens: inside.reduce((sum, run) => sum + tokensOf(run), 0),
        runs: inside,
    };

    if (failed[0]) {
        activity.lastFailed = failed[0];
    }

    return activity;
}

/**
 * The overview's rollups from two app-wide pages, so a pass costs the same
 * requests whatever the agent count: `recent` (the newest runs of every agent)
 * gives the last run and the 24 h activity, `active` (running and waiting runs)
 * the counters. A full `recent` page inside the window marks every activity a floor.
 */
export function buildRollups(
    agents: readonly AgentWire[],
    schedules: readonly ScheduleWire[],
    recent: RunPage,
    active: RunPage,
    now: number,
): Record<string, AgentRollup> {
    const { saturated } = summarizeActivity(recent.data, now, recent.data.length > 0 ? recent.meta.limit : Infinity);
    const older = recent.meta.total > recent.data.length;

    return Object.fromEntries(agents.map((agent): [string, AgentRollup] => {
        const runs = recent.data.filter((run) => run.agent === agent.name);
        const mine = active.data.filter((run) => run.agent === agent.name);
        const activity = summarizeActivity(runs, now, Infinity);

        activity.saturated = saturated;

        const rollup: AgentRollup = {
            running: mine.filter((run) => run.status === 'running').length,
            waiting: mine.filter((run) => run.status === 'waiting').length,
            lastBeyond: !runs[0] && older,
            activity,
        };

        if (runs[0]) {
            rollup.last = runs[0];
        }

        const next = nextFireOf(agent.name, schedules);

        if (next) {
            rollup.nextFire = next;
        }

        return [agent.name, rollup];
    }));
}

/** The activity strip's accessible name: "12 runs in the last 24 h: 10 completed, 2 failed". */
export function activityLabel(activity: Activity): string {
    if (activity.count === 0) {
        return 'No runs in the last 24 h';
    }

    const counts = new Map<string, number>();

    for (const mark of activity.marks) {
        counts.set(mark.status, (counts.get(mark.status) ?? 0) + 1);
    }

    const parts = Array.from(counts, ([status, n]) => `${n} ${status}`).join(', ');

    return `${activity.count}${activity.saturated ? '+' : ''} runs in the last 24 h: ${parts}`;
}

/** "triage 71% · digest 29%": the two largest token shares by agent. */
export function tokenShares(runs: readonly RunWire[]): string {
    const total = runs.reduce((sum, run) => sum + tokensOf(run), 0);

    if (total === 0) {
        return '';
    }

    const byAgent = new Map<string, number>();

    for (const run of runs) {
        byAgent.set(run.agent, (byAgent.get(run.agent) ?? 0) + tokensOf(run));
    }

    return Array.from(byAgent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name, tokens]) => `${name} ${Math.round(tokens / total * 100)}%`)
        .join(' · ');
}

/** The failed tile's line: the newest failed run and its error code. */
export function failedSummary(activity: Activity): string {
    const run = activity.lastFailed;

    return run ? `${shortId(run.id)} · ${run.error?.code ?? 'failed'}` : 'no failures';
}
