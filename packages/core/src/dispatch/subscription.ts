/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { assertConcurrencyMaxRuns } from '../channel/concurrency.ts';
import { AGENT_CHANNEL_NAME } from '../channel/constants.ts';
import { assertChannelName } from '../channel/helpers.ts';
import { DEFAULT_DISPATCH_ROLE } from './constants.ts';
import { checkFrom, checkMaxDepth, checkMaxPerRun } from './helpers.ts';
import type { AgentSubscriber } from './types.ts';

/**
 * The opt-in for dispatch(): each `agent.on({ role })` in an agent's
 * channels is one role (channel `agent`, subscription id = role, so the role
 * shares the id namespace of the agent's other subscriptions and defineAgent()
 * refuses a duplicate). Pure data, like `http.on()`.
 */
export const agent: AgentSubscriber = {
    on: (options = {}) => {
        assertConcurrencyMaxRuns(options.concurrencyMaxRuns, 'agent.on() concurrencyMaxRuns');

        const role = options.role ?? DEFAULT_DISPATCH_ROLE;

        assertChannelName(role);

        const label = 'agent.on()';
        const maxPerRun = checkMaxPerRun(label, options.maxPerRun);
        const maxDepth = checkMaxDepth(label, options.maxDepth);
        const from = checkFrom(label, options.from);

        return {
            channel: AGENT_CHANNEL_NAME,
            id: role,
            ...(options.concurrencyMaxRuns !== undefined ? { concurrencyMaxRuns: options.concurrencyMaxRuns } : {}),
            options: {
                schema: options.schema,
                maxPerRun,
                maxDepth,
                ...(from ? { from } : {}),
            },
            ...(options.concurrencyKey ? { concurrencyKey: options.concurrencyKey } : {}),
            ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        };
    },
};
