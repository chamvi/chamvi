/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    Agent,
    ChannelContext,
    ChannelSubscription,
    ConversationRef,
    IEngine,
} from '@chamvi/core';
import type { OverlapPolicy } from '../subscription/types.ts';

/** The options `cron.on()` stores on a subscription, read back and checked. */
export type CronOptions = {
    expression: string;
    timezone?: string;
    overlap: OverlapPolicy;
    payload?: unknown;
    /** Set together with `text`: the conversation each run starts in. */
    conversation?: ConversationRef;
    text?: string;
};

export type CronTickContext = {
    engine: IEngine;
    agent: Agent;
    subscription: ChannelSubscription;
    /** The tick's planned fire time; forms the idempotency key. */
    scheduledAt: Date;
    /**
     * The channel's dispatch (sets the channel name itself). Default
     * engine.dispatch with `channel` = the subscription's channel. Not
     * used for a subscription with a conversation, which dispatches through
     * the conversation channel's intake.
     */
    dispatch?: ChannelContext['dispatch'];
};

export type CronTickDispatched = {
    dispatched: true;
    runId: string;
    deduplicated: boolean;
};

/**
 * `overlap`: the policy held the tick back; `channel`: the engine holds no
 * channel named by the subscription's conversation.
 */
export type CronTickSkipped = {
    dispatched: false;
    reason: 'overlap' | 'channel';
};

export type CronTickResult = CronTickDispatched | CronTickSkipped;
