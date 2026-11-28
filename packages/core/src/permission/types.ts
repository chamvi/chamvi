/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IAgentRegistry } from '../agent/types.ts';

export type RequireToolPermissionOptions = {
    /** What a run without an invoker (cron, webhook) may use. Default `'deny'`. */
    withoutInvoker?: 'allow' | 'deny';
};

/** The agents a read rule decides over, passed per call (an http app's allowlisted view). */
export type AgentScope = {
    agents: IAgentRegistry;
};
