/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { Permission } from '@chamvi/access';
import type { AgentWire, RunWire, ScheduleWire } from '@chamvi/http-kit';

/**
 * Why the agent's runs are hidden: a private agent while the session is not
 * allowed `chamvi_agent_read`, whose runs the server leaves out of every
 * listing (its rollup would read as zero); else `undefined`.
 */
export function hiddenRunsNotice(agent: AgentWire, allowed: (name: string) => boolean): string | undefined {
    if (!agent.private || allowed(Permission.AGENT_READ)) {
        return undefined;
    }

    return `Runs hidden: reading them needs ${Permission.AGENT_READ} for ${agent.name}`;
}

export function matchesName(agent: AgentWire, query: string): boolean {
    const needle = query.trim().toLowerCase();

    return !needle || agent.name.toLowerCase().includes(needle);
}

export function nextFireOf(agent: string, schedules: readonly ScheduleWire[]): ScheduleWire | undefined {
    return schedules.filter((s) => s.agent === agent)
        .sort((a, b) => Date.parse(a.nextAt) - Date.parse(b.nextAt))[0];
}

/** The newest run of a trigger among `runs` (newest first); `null` when none is among them. */
export function lastRunOf(runs: readonly RunWire[], trigger: string): RunWire | null {
    return runs.find((run) => run.trigger.trigger === trigger) ?? null;
}

export function oldestWaiting(runs: readonly RunWire[]): RunWire | undefined {
    return [...runs].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))[0];
}

/** A budget timeout as "15 min", "45 s" or "2 h". */
export function formatBudgetTime(ms: number | undefined): string {
    if (ms === undefined) {
        return 'none';
    }

    if (ms % 3_600_000 === 0) {
        return `${ms / 3_600_000} h`;
    }

    if (ms % 60_000 === 0) {
        return `${ms / 60_000} min`;
    }

    return `${Math.round(ms / 1000)} s`;
}
