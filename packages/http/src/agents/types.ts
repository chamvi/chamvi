/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Budget } from '@chamvi/core';

/** What a cron tick does while a run of the same subscription is active (as `@chamvi/channel-cron` defines it). */
export type ScheduleOverlap = 'skip' | 'queue-one' | 'allow';

// #region summaries
/** An agent as `GET /agents` lists it. */
export type AgentSummary = {
    name: string;
    /** The agent's `kind`: `simple` for a simple agent (defineSimpleAgent()), else `model`. */
    kind: 'model' | 'simple';
    /**
     * The agent's subscriptions: the channel name and the subscription id;
     * `hook` is the ready-made path of a subscription to a webhook channel
     * this app mounts.
     */
    channels: Array<{
        channel: string;
        id: string;
        hook?: string;
    }>;
    budget: Budget;
    /** Declared state collections. */
    state: string[];
};

/** An agent that failed to load, as `GET /agents` lists it next to the agents. */
export type AgentIssue = {
    agent: string;
    message: string;
    at: Date;
};

/** A cron subscription as `GET /schedules` lists it (definitions only, not scheduler health). */
export type ScheduleSummary = {
    agent: string;
    /** The cron channel's name. */
    channel: string;
    /** The subscription id. */
    trigger: string;
    expression: string;
    timezone?: string;
    overlap: ScheduleOverlap;
    /** ISO time of the next fire after now. */
    nextAt: string;
};

// #endregion summaries

/** Body of `PATCH /agents/:name/state/kv/:key`; internal. */
export type KvBody = {
    value: unknown;
};
