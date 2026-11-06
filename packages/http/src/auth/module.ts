/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { AgentAction, ConnectionAction } from './types.ts';

/** `agent:<agent>:<action>`. */
export function agentPermission(agent: string, action: AgentAction): string {
    return `agent:${agent}:${action}`;
}

/** `connection:<name>:<action>`; `write` implies `read` on every connection route. */
export function connectionPermission(connection: string, action: ConnectionAction): string {
    return `connection:${connection}:${action}`;
}

