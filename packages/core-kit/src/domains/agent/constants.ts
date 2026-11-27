/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The agent-name rule: lowercase letters and digits in words joined by single hyphens (agent, channel, role and peer names). */
export const AGENT_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The longest name the agent-name rule allows. */
export const AGENT_NAME_MAX_LENGTH = 64;
