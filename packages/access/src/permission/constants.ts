/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The permission names chamvi itself checks. Apps may check any other name. */
export const Permission = {
    AGENT_READ: 'chamvi_agent_read',
    AGENT_RUN: 'chamvi_agent_run',
    AGENT_APPROVE: 'chamvi_agent_approve',
    RUN_READ: 'chamvi_run_read',
    RUN_CANCEL: 'chamvi_run_cancel',
    STATE_READ: 'chamvi_state_read',
    STATE_WRITE: 'chamvi_state_write',
    CONNECTION_READ: 'chamvi_connection_read',
    CONNECTION_WRITE: 'chamvi_connection_write',
    CONNECTION_CREATE: 'chamvi_connection_create',
    TOOL_USE: 'chamvi_tool_use',
} as const;

/** The values of `Permission`, in declaration order. */
export const PERMISSION_NAMES: readonly string[] = Object.freeze(Object.values(Permission));
