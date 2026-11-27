/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Agent, ChannelSubscription } from '@chamvi/core';
import { NotFoundError } from '@chamvi/errors';
import { HTTP_CHANNEL_NAME } from '../../channels/constants.ts';

/** The agent's `http.on()` subscription, else 404. */
export function requireHttpSubscription(agent: Agent): ChannelSubscription {
    const subscription = findHttpSubscription(agent);

    if (!subscription) {
        throw new NotFoundError({ message: `Agent "${agent.name}" has no http subscription.` });
    }

    return subscription;
}

/** The agent's subscription to the `http` channel (REST and MCP starts), if any. */
export function findHttpSubscription(agent: Agent): ChannelSubscription | undefined {
    return agent.definition.channels?.find((subscription) => subscription.channel === HTTP_CHANNEL_NAME);
}
