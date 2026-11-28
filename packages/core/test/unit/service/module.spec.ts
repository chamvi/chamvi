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
import { AbstractEntityService } from '@chamvi/core';

class ExposedService extends AbstractEntityService {
    granted(actor: ActorContext<unknown>, name: string, attributes?: Record<string, unknown>): Promise<boolean> {
        return this.isGranted(actor, name, attributes);
    }

    grantedSome(actor: ActorContext<unknown>, name: string): Promise<boolean> {
        return this.isGrantedSome(actor, name);
    }

    asserted(actor: ActorContext<unknown>, name: string, attributes?: Record<string, unknown>): Promise<void> {
        return this.assertGranted(actor, name, attributes);
    }
}

function restricted(name: string, query: Record<string, unknown>): PermissionBinding {
    return {
        permission: { name },
        policies: [{ type: 'attributes', query } as never],
    };
}

const NAME = Permission.RUN_READ;

const actor: ActorContext = {
    permissionEvaluator: new HolderPermissionEvaluator(
        { bindings: [restricted(NAME, { agent: 'echo' })] },
        { now: () => new Date(2026, 10, 11, 10, 0) },
    ),
};

describe('AbstractEntityService', () => {
    const service = new ExposedService();

    it('checks one resource with attributes, some resource without', async () => {
        expect(await service.granted(actor, NAME, { agent: 'echo' })).toBe(true);
        expect(await service.granted(actor, NAME, { agent: 'x' })).toBe(false);
        expect(await service.grantedSome(actor, NAME)).toBe(true);
        expect(await service.grantedSome(actor, Permission.AGENT_READ)).toBe(false);
    });

    it('passes the collection gate without attributes', async () => {
        await expect(service.asserted(actor, NAME)).resolves.toBeUndefined();
        await expect(service.asserted(actor, NAME, { agent: 'echo' })).resolves.toBeUndefined();
    });

    it('refuses a resource outside the grant with the 403 of the permission', async () => {
        const error = await service.asserted(actor, NAME, { agent: 'x' }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ForbiddenError);
        expect((error as ForbiddenError).message).toBe(`Missing permission "${NAME}".`);
    });

    it('refuses an actor without the permission', async () => {
        await expect(service.asserted(actor, Permission.AGENT_READ)).rejects.toThrow(`Missing permission "${Permission.AGENT_READ}".`);
    });
});
