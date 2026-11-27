/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { AGENT_NAME_MAX_LENGTH, AGENT_NAME_PATTERN } from './constants.ts';

/**
 * Whether `value` follows the agent-name rule: lowercase letters and digits
 * in words joined by single hyphens, at most `AGENT_NAME_MAX_LENGTH`
 * characters (agent, channel, role and peer names).
 */
export function isAgentName(value: unknown): value is string {
    return typeof value === 'string' && value.length <= AGENT_NAME_MAX_LENGTH && AGENT_NAME_PATTERN.test(value);
}
