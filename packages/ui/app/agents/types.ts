/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { RunStatusLiteral } from '@chamvi/core';
import type { RunWire, ScheduleWire } from '@chamvi/ui-kit';

/** One subscription of an agent, as its chip shows it. */
export type ChannelChip = {
    /** The channel's name (`http`, `cron`, `github`, `webhook`, or a custom one). */
    channel: string;
    /** The subscription id. */
    id: string;
    /** What it listens to: the event names, cron expression or hook path. */
    detail?: string;
    hook?: string;
};

export type ActivityMark = {
    id: string;
    status: RunStatusLiteral;
    /** Position on the strip in percent, 0 the window start, 100 now. */
    left: number;
};

export type Activity = {
    /** Runs created inside the window, as far as the runs read reach. */
    count: number;
    /** The read limit was reached inside the window: there may be more runs. */
    saturated: boolean;
    marks: ActivityMark[];
    failed: number;
    lastFailed?: RunWire;
    tokens: number;
    runs: RunWire[];
};

export type AgentRollup = {
    running: number;
    waiting: number;
    last?: RunWire;
    /** No run of the agent among the newest runs read, while the app has older ones. */
    lastBeyond: boolean;
    nextFire?: ScheduleWire;
    activity: Activity;
};

export type PayloadResult = { ok: true; value: unknown } | { ok: false; message: string };
