/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionStatus } from '@chamvi/core';
import { hasPermission } from '../auth/helpers.ts';
import { STATUS_BADGES } from './constants.ts';
import type { ConnectionBadge } from './types.ts';

export function statusBadge(status: ConnectionStatus): ConnectionBadge {
    return Object.hasOwn(STATUS_BADGES, status) ? STATUS_BADGES[status] : { label: String(status), tone: 'queued' };
}

/** Widgets, the live stream and reset need `connection:<name>:write`. */
export function canWriteConnection(permissions: readonly string[], name: string): boolean {
    return hasPermission(permissions, `connection:${name}:write`);
}
