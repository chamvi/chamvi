/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionStatus } from '@chamvi/core';
import { hasPermission } from '../auth/helpers.ts';
import { CONNECTIONS_CREATE_PERMISSION, STATUS_BADGES } from './constants.ts';
import type { ConnectionBadge, ConnectionTypeWire, ConnectionWire } from './types.ts';

export function statusBadge(status: ConnectionStatus): ConnectionBadge {
    return Object.hasOwn(STATUS_BADGES, status) ? STATUS_BADGES[status] : { label: String(status), tone: 'queued' };
}

/**
 * The chip of a connection: what its configuration lacks first, then a
 * connection with nothing running in this process (no failure: mail and
 * calendar never hold one) as `configured`, else its live status.
 */
export function connectionBadge(connection: Pick<ConnectionWire, 'status' | 'state' | 'live'>): ConnectionBadge {
    if (connection.state === 'not_configured') {
        return { label: 'not configured', tone: 'cancelled' };
    }

    if (connection.state === 'incomplete') {
        return { label: 'incomplete', tone: 'waiting' };
    }

    if (connection.state === 'configured' && connection.live === false) {
        return { label: 'configured', tone: 'completed' };
    }

    return statusBadge(connection.status);
}

/** What keeps a connection from working, in words, when its configuration does; `undefined` when nothing does. */
export function connectionProblem(connection: Pick<ConnectionWire, 'state' | 'missing' | 'reason'>): string | undefined {
    if (connection.state === 'not_configured') {
        return 'Not configured yet.';
    }

    if (connection.state !== 'incomplete') {
        return undefined;
    }

    if (connection.reason) {
        return `Incomplete: ${connection.reason}`;
    }

    return connection.missing?.length ? `Incomplete: ${connection.missing.join(', ')} missing.` : 'Incomplete.';
}

/** Accounts of the type can be added here, by this principal; `creatable` is false when the app cannot store them. */
export function canAddAccount(type: ConnectionTypeWire, permissions: readonly string[]): boolean {
    return type.multiple && type.creatable && hasPermission(permissions, CONNECTIONS_CREATE_PERMISSION);
}

/** Widgets, the live stream and reset need `connection:<name>:write`. */
export function canWriteConnection(permissions: readonly string[], name: string): boolean {
    return hasPermission(permissions, `connection:${name}:write`);
}
