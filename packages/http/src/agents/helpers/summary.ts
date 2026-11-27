/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { DEFAULT_MAX_STEPS } from '@chamvi/core';
import type { Agent } from '@chamvi/core';
import { CronExpressionParser } from 'cron-parser';
import { webhookUrl } from '../../channels/helpers.ts';
import type { AgentSummary, ScheduleOverlap, ScheduleSummary } from '@chamvi/core-kit';

/**
 * An agent as `GET /agents` lists it; a subscription to one of `hookChannels`
 * (the webhook channels the app mounts) carries its `hook` URL.
 */
export function summarizeAgent(agent: Agent, basePath: string, hookChannels: ReadonlySet<string> = new Set()): AgentSummary {
    const { definition } = agent;

    return {
        name: agent.name,
        kind: agent.kind,
        channels: (definition.channels ?? []).map((subscription) => (hookChannels.has(subscription.channel) ?
            {
                channel: subscription.channel,
                id: subscription.id,
                hook: webhookUrl(basePath, subscription.channel, agent.name, String(subscription.options.path)),
            } :
            { channel: subscription.channel, id: subscription.id })),
        // defineModelAgent applied the defaults; the type keeps them optional
        budget: { maxSteps: DEFAULT_MAX_STEPS, ...definition.budget },
        state: Object.keys(definition.state ?? {}),
        private: definition.private === true,
        ...(agent.kind === 'remote' ? { remote: { peer: agent.definition.peer, agent: agent.definition.agent } } : {}),
    };
}

/** The next fire time after `now`, or `undefined` for an expression or timezone cron-parser refuses. */
function nextCronFire(expression: string, timezone: string | undefined, now: Date): string | undefined {
    try {
        return CronExpressionParser.parse(expression, {
            currentDate: now,
            ...(timezone ? { tz: timezone } : {}),
        }).next().toDate().toISOString();
    } catch {
        return undefined;
    }
}

/**
 * Every cron subscription (one whose options carry a string `expression`,
 * as `@chamvi/channel-cron` builds them) of every agent, in definition
 * order, with its next fire time after `now`.
 */
export function listSchedules(agents: Iterable<Agent>, now: Date): ScheduleSummary[] {
    const schedules: ScheduleSummary[] = [];

    for (const agent of agents) {
        for (const subscription of agent.definition.channels ?? []) {
            const { expression } = subscription.options;

            if (typeof expression !== 'string') {
                continue;
            }

            const timezone = typeof subscription.options.timezone === 'string' ? subscription.options.timezone : undefined;
            const nextAt = nextCronFire(expression, timezone, now);

            if (nextAt === undefined) {
                continue;
            }

            schedules.push({
                agent: agent.name,
                channel: subscription.channel,
                trigger: subscription.id,
                expression,
                ...(timezone ? { timezone } : {}),
                overlap: (subscription.options.overlap as ScheduleOverlap | undefined) ?? 'skip',
                nextAt,
            });
        }
    }

    return schedules;
}
