/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import type { PermissionBinding } from '@chamvi/access';
import { HolderPermissionEvaluator, Permission } from '@chamvi/access';
import { ForbiddenError } from '@chamvi/errors';
import type { ActorContext } from '@chamvi/core';
import {
    assertConnectionAccess,
    assertConnectionCreate,
    canReadConnection,
    canWriteConnection,
    connectionResource,
} from '@chamvi/core';

function bound(name: string, query?: Record<string, unknown>): PermissionBinding {
    return {
        permission: { name },
        ...(query ? { policies: [{ type: 'attributes', query } as never] } : {}),
    };
}

function actorOf(...bindings: PermissionBinding[]): ActorContext {
    return {
        permissionEvaluator: new HolderPermissionEvaluator(
            { bindings },
            { now: () => new Date(2026, 10, 11, 10, 0) },
        ),
    };
}

describe('connectionResource', () => {
    it('carries the type only when it is known', () => {
        expect(connectionResource('a', 'mail')).toEqual({ name: 'a', type: 'mail' });
        expect(connectionResource('a', undefined)).toEqual({ name: 'a' });
    });
});

describe('canReadConnection', () => {
    it('reads a connection of the granted type, not one of an unknown type', async () => {
        const actor = actorOf(bound(Permission.CONNECTION_READ, { type: 'mail' }));

        await expect(canReadConnection(actor, connectionResource('a', 'mail'))).resolves.toBe(true);
        await expect(canReadConnection(actor, connectionResource('a', undefined))).resolves.toBe(false);
        await expect(canWriteConnection(actor, connectionResource('a', 'mail'))).resolves.toBe(false);
    });

    it('lets write imply read', async () => {
        const actor = actorOf(bound(Permission.CONNECTION_WRITE));

        await expect(canReadConnection(actor, connectionResource('a', 'mail'))).resolves.toBe(true);
        await expect(canWriteConnection(actor, connectionResource('a', 'mail'))).resolves.toBe(true);
    });
});

describe('assertConnectionAccess', () => {
    it('refuses an unknown type with 403, not 404', async () => {
        const actor = actorOf(bound(Permission.CONNECTION_READ, { type: 'mail' }));

        await expect(assertConnectionAccess(actor, connectionResource('a', undefined))).rejects.toThrow(ForbiddenError);
        await expect(assertConnectionAccess(actor, connectionResource('a', undefined)))
            .rejects.toThrow(`Missing permission "${Permission.CONNECTION_READ}".`);
        await expect(assertConnectionAccess(actor, connectionResource('a', 'mail'))).resolves.toBeUndefined();
    });

    it('refuses a write with read only', async () => {
        const actor = actorOf(bound(Permission.CONNECTION_READ));

        await expect(assertConnectionAccess(actor, connectionResource('a', 'mail'), true))
            .rejects.toThrow('Missing permission "chamvi_connection_write".');
    });
});

describe('assertConnectionCreate', () => {
    it('allows only the granted type', async () => {
        const actor = actorOf(bound(Permission.CONNECTION_CREATE, { type: 'mail' }));

        await expect(assertConnectionCreate(actor, 'mail')).resolves.toBeUndefined();
        await expect(assertConnectionCreate(actor, 'calendar'))
            .rejects.toThrow(`Missing permission "${Permission.CONNECTION_CREATE}".`);
    });
});
