/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const DEFAULT_MAX_STEPS = 20;
export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export const AGENT_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** The longest name the agent-name rule allows (agent, channel, role and peer names). */
export const AGENT_NAME_MAX_LENGTH = 64;
