/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import type { IConnectionHandle } from '@chamvi/core';
import { NotFoundError } from '@ebec/http';
import { forbidden, isGranted } from '../../auth/helpers.ts';
import type { Principal } from '../../auth/types.ts';
import type { ConnectionServiceContext } from '../types.ts';

/**
 * The resource attributes of a connection (`{ name, type }`), without
 * `type` for a name the app does not know: a policy over the type then
 * fails, so a refusal of an unknown name looks like any other.
 */
export function connectionResource(name: string, type: string | undefined): Record<string, unknown> {
    return type === undefined ? { name } : { name, type };
}

/** `chamvi_connection_write` for the connection. */
export function canWrite(ctx: ConnectionServiceContext, principal: Principal, resource: Record<string, unknown>): Promise<boolean> {
    return isGranted(principal, Permission.CONNECTION_WRITE, ctx.clock, resource);
}

/** `chamvi_connection_read` or `chamvi_connection_write` (write implies read). */
export async function canRead(ctx: ConnectionServiceContext, principal: Principal, resource: Record<string, unknown>): Promise<boolean> {
    return await canWrite(ctx, principal, resource) || isGranted(principal, Permission.CONNECTION_READ, ctx.clock, resource);
}

/**
 * 403 unless the principal may read the connection, or may write it with
 * `write`: before a 404, so a refusal says nothing about the name.
 */
export async function assertConnectionAccess(
    ctx: ConnectionServiceContext,
    principal: Principal,
    resource: Record<string, unknown>,
    write = false,
): Promise<void> {
    if (write ? !await canWrite(ctx, principal, resource) : !await canRead(ctx, principal, resource)) {
        throw forbidden(write ? Permission.CONNECTION_WRITE : Permission.CONNECTION_READ);
    }
}

/** The handle of `name` the principal may read (403, then 404), or may write with `write`. */
export async function requireHandle(ctx: ConnectionServiceContext, principal: Principal, name: string, write = false): Promise<IConnectionHandle> {
    const handle = ctx.connections().find((candidate) => candidate.name === name);

    await assertConnectionAccess(ctx, principal, connectionResource(name, handle?.type), write);

    if (!handle) {
        throw new NotFoundError({ message: `The connection "${name}" does not exist.` });
    }

    return handle;
}
