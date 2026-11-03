/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export {
    DEFAULT_DISPATCH_MAX_DEPTH,
    DEFAULT_DISPATCH_ROLE,
    DEFAULT_DISPATCH_WAIT_TIMEOUT_MS,
    DEFAULT_MAX_DISPATCHES_PER_RUN,
    DISPATCH_DEPTH_MAX,
} from './constants.ts';
export * from './descendants.ts';
export * from './start.ts';
export * from './subscription.ts';
export { dispatchTools } from './tools.ts';
export type {
    AgentSubscriber,
    AgentSubscriptionOptions,
    DispatchInput,
    DispatchOutcome,
    DispatchToInput,
    DispatchToolsOptions,
    DispatchWaitOptions,
} from './types.ts';
export * from './wait.ts';
