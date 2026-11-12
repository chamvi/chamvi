/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission, can } from '@chamvi/access';
import type { PermissionHolder } from '@chamvi/access';
import type { ConnectionStatus } from '@chamvi/core';
import { STATUS_BADGES } from './constants.ts';
import type {
    ConnectionBadge,
    ConnectionRef,
    ConnectionTypeWire,
    ConnectionWire,
} from './types.ts';

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

/**
 * Accounts of the type can be added here, by this principal: the type takes
 * several and the app can store them (`creatable`), and the principal holds
 * `chamvi_connection_create` for the type.
 */
export async function canAddAccount(type: ConnectionTypeWire, holder: PermissionHolder | undefined): Promise<boolean> {
    if (!type.multiple || !type.creatable || !holder) {
        return false;
    }

    return can(holder, Permission.CONNECTION_CREATE, { attributes: { type: type.type }, now: new Date() });
}

/** The resource attributes of a connection; without a known type only its name, as the server checks an unknown one. */
function connectionAttributes(connection: ConnectionRef): Record<string, unknown> {
    return connection.type === undefined ? { name: connection.name } : { name: connection.name, type: connection.type };
}

/** Widgets, the live stream and reset need `chamvi_connection_write` for the connection. */
export async function canWriteConnection(holder: PermissionHolder | undefined, connection: ConnectionRef): Promise<boolean> {
    if (!holder) {
        return false;
    }

    return can(holder, Permission.CONNECTION_WRITE, { attributes: connectionAttributes(connection), now: new Date() });
}

/** Reading a connection takes `chamvi_connection_read` or `chamvi_connection_write` for it. */
export async function canReadConnection(holder: PermissionHolder | undefined, connection: ConnectionRef): Promise<boolean> {
    if (!holder) {
        return false;
    }

    const attributes = connectionAttributes(connection);
    const now = new Date();

    return await can(holder, Permission.CONNECTION_READ, { attributes, now }) ||
        can(holder, Permission.CONNECTION_WRITE, { attributes, now });
}
