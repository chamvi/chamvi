/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


import { Permission } from '@chamvi/access';
import type { AgentWire, ScheduleWire } from '@chamvi/http-kit';
import type { ChannelChip } from '../types.ts';

/** The part of a subscription id after its first `:` (`github:issues.opened` -> `issues.opened`), if any. */
function idDetail(id: string): string | undefined {
    const at = id.indexOf(':');

    return at >= 0 && at < id.length - 1 ? id.slice(at + 1) : undefined;
}

/**
 * One chip per subscription (`AgentSummary.channels`): the channel and what
 * it listens to. A cron subscription shows its expression from
 * `GET /schedules` (else its id's detail), a webhook its path, GitHub its
 * events; any other channel the part of the id after the first `:`.
 */
export function channelChips(agent: AgentWire, schedules: readonly ScheduleWire[]): ChannelChip[] {
    return agent.channels.map((subscription): ChannelChip => {
        const chip: ChannelChip = { channel: subscription.channel, id: subscription.id };
        const schedule = schedules.find((s) => s.agent === agent.name &&
            s.channel === subscription.channel &&
            s.trigger === subscription.id);
        const detail = schedule?.expression ?? idDetail(subscription.id);

        if (detail) {
            chip.detail = detail;
        }

        if (subscription.hook) {
            chip.hook = subscription.hook;
        }

        return chip;
    });
}

/** Start run shows for an agent with an `http` subscription while the session is allowed `chamvi_agent_run`. */
export function canStartAgent(agent: AgentWire, allowed: (name: string) => boolean): boolean {
    return hasHttpSubscription(agent) && allowed(Permission.AGENT_RUN);
}

/** The agent subscribes to the `http` channel, so REST (and the UI) can start it. */
export function hasHttpSubscription(agent: AgentWire): boolean {
    return agent.channels.some((subscription) => subscription.channel === 'http');
}
