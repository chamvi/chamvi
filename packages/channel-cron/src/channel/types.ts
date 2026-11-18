/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ChannelStatus, IChannel } from '@chamvi/core';
import type { CronSubscriber } from '../subscription/types.ts';

export type CronChannelErrorContext = {
    agent: string;
    /** The subscription id. */
    subscription: string;
};

export type CronChannelOptions = {
    /** The channel name; default `cron`. A second instance needs its own. */
    name?: string;
    /** Owner of the tick locks. Default `${hostname()}-${pid}`. */
    owner?: string;
    /**
     * How long a tick's lock key is held; a tick whose timer fires this late or
     * later is skipped. Default SCHEDULE_LOCK_TTL_MS.
     */
    lockTtlMs?: number;
    /**
     * Receives a failing tick (lock store, overlap check or dispatch) and a
     * folder agent's subscription hubwire cannot schedule. Ticks another
     * replica won are not errors. Default console.error('[chamvi]', error, ctx).
     */
    onError?: (error: unknown, ctx: CronChannelErrorContext) => void;
};

/** The cron channel: background inbound only (no `in`, no `out`), with `on()` bound to its name and a `status()`. */
export type CronChannel = IChannel & CronSubscriber & { status(): ChannelStatus };
