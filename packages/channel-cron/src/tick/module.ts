/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent, ChannelSubscription } from '@chamvi/core';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { OVERLAP_POLICIES } from '../subscription/constants.ts';
import { readCronConversation } from '../subscription/helpers.ts';
import type { OverlapPolicy } from '../subscription/types.ts';
import { isOverlapping } from './helpers.ts';
import type { CronOptions, CronTickContext, CronTickResult } from './types.ts';

/**
 * Reads the options `cron.on()` stores on a subscription. Throws
 * InvalidAgentDefinitionError for a subscription that is not a well-formed
 * cron subscription, or one with a conversation for an agent without
 * conversations.
 */
export function readCronOptions(agent: Agent, subscription: ChannelSubscription): CronOptions {
    const fail = (reason: string) => new InvalidAgentDefinitionError(
        `Agent "${agent.name}" subscription "${subscription.id}": ${reason}`,
    );

    const {
        expression,
        timezone,
        overlap = 'skip',
        payload,
        conversation,
        text,
    } = subscription.options;

    if (typeof expression !== 'string') {
        throw fail('has no cron expression.');
    }

    if (timezone !== undefined && typeof timezone !== 'string') {
        throw fail('has an invalid timezone.');
    }

    if (!OVERLAP_POLICIES.includes(overlap as OverlapPolicy)) {
        throw fail(`has an unknown overlap policy "${String(overlap)}".`);
    }

    const bound = readCronConversation(conversation, text, fail);

    if (bound && !agent.definition.conversation) {
        throw fail('has a conversation, but the agent has not enabled conversations.');
    }

    return {
        expression,
        timezone,
        overlap: overlap as OverlapPolicy,
        payload,
        ...bound,
    };
}

/**
 * Fires one tick of a cron subscription. With a conversation, it answers
 * `{ dispatched: false, reason: 'channel' }` when the engine holds no channel
 * of the conversation's name. It applies the overlap policy, then
 * dispatches with the idempotency key `<subscriptionId>@<scheduledAt ISO>`,
 * so a second firing of the same tick (another replica, a retry) is
 * deduplicated. The subscription's own idempotencyKey() is ignored. Without
 * a concurrencyKey() on the subscription, the run is keyed by the
 * subscription id under `skip` and `queue-one` (so a queued run waits behind
 * the active one) and not keyed under `allow`. With a conversation, the run
 * is dispatched through the intake of that conversation's channel
 * (`channelContext().dispatchConversation()`, the user turn `text`, the
 * source address the reference's), keyed by the conversation's scope; an
 * authorizer's refusal rejects.
 */
export async function fireCronSubscription(ctx: CronTickContext): Promise<CronTickResult> {
    const {
        engine,
        agent,
        subscription,
        scheduledAt,
    } = ctx;
    const options = readCronOptions(agent, subscription);
    const channel = options.conversation ? engine.getChannel(options.conversation.channel) : undefined;

    if (options.conversation && !channel) {
        return { dispatched: false, reason: 'channel' };
    }

    if (await isOverlapping(engine.store.runs, agent.name, subscription.id, options.overlap)) {
        return { dispatched: false, reason: 'overlap' };
    }

    const iso = scheduledAt.toISOString();
    const payload = options.payload ?? { scheduledAt: iso };

    if (channel && options.conversation && options.text !== undefined) {
        const {
            account,
            chat,
            audience,
            address,
        } = options.conversation;
        // the conversation scope sets the concurrency key; the intake refuses another
        const result = await engine.channelContext(channel).dispatchConversation({
            agent: agent.name,
            trigger: subscription.id,
            payload,
            idempotencyKey: `${subscription.id}@${iso}`,
            ...(address !== undefined ? { address } : {}),
        }, {
            account,
            chat,
            audience,
            text: options.text,
        });

        return { dispatched: true, ...result };
    }

    const envelope = {
        agent: agent.name,
        trigger: subscription.id,
        payload,
        idempotencyKey: `${subscription.id}@${iso}`,
        concurrencyKey: subscription.concurrencyKey?.(payload) ??
            (options.overlap === 'allow' ? undefined : subscription.id),
    };
    const result = ctx.dispatch ?
        await ctx.dispatch(envelope) :
        await engine.dispatch({ ...envelope, channel: subscription.channel });

    return { dispatched: true, ...result };
}
