/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import { forbidden, isActorGranted } from '../actor/helpers.ts';
import type { ActorContext } from '../actor/types.ts';

/**
 * The resource attributes of a connection (`{ name, type }`), without
 * `type` for a name the app does not know: a policy over the type then
 * fails, so a refusal of an unknown name looks like any other.
 */
export function connectionResource(name: string, type: string | undefined): Record<string, unknown> {
    return type === undefined ? { name } : { name, type };
}

/** `chamvi_connection_write` for the connection. */
export function canWriteConnection(actor: ActorContext<unknown>, resource: Record<string, unknown>): Promise<boolean> {
    return isActorGranted(actor, Permission.CONNECTION_WRITE, resource);
}

/** `chamvi_connection_read` or `chamvi_connection_write` (write implies read). */
export async function canReadConnection(actor: ActorContext<unknown>, resource: Record<string, unknown>): Promise<boolean> {
    return await canWriteConnection(actor, resource) || isActorGranted(actor, Permission.CONNECTION_READ, resource);
}

/**
 * 403 unless the actor may read the connection, or may write it with
 * `write`: before a 404, so a refusal says nothing about the name.
 */
export async function assertConnectionAccess(
    actor: ActorContext<unknown>,
    resource: Record<string, unknown>,
    write = false,
): Promise<void> {
    if (write ? !await canWriteConnection(actor, resource) : !await canReadConnection(actor, resource)) {
        throw forbidden(write ? Permission.CONNECTION_WRITE : Permission.CONNECTION_READ);
    }
}

/**
 * 403 unless the actor may create a connection of `type`: before the type
 * lookup's 404, so an unknown type is refused like a foreign one.
 */
export async function assertConnectionCreate(actor: ActorContext<unknown>, type: string): Promise<void> {
    if (!await isActorGranted(actor, Permission.CONNECTION_CREATE, { type })) {
        throw forbidden(Permission.CONNECTION_CREATE);
    }
}
