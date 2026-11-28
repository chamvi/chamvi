/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { assertConnectionAccess, connectionResource } from '@chamvi/core';
import type { ActorContext, IConnectionHandle } from '@chamvi/core';
import { NotFoundError } from '@chamvi/errors';
import type { ConnectionHttpServiceContext } from '../types.ts';

/** The handle of `name` the actor may read (403, then 404), or may write with `write`. */
export async function requireHandle(
    ctx: ConnectionHttpServiceContext,
    actor: ActorContext,
    name: string,
    write = false,
): Promise<IConnectionHandle> {
    const handle = ctx.connections().find((candidate) => candidate.name === name);

    await assertConnectionAccess(actor, connectionResource(name, handle?.type), write);

    if (!handle) {
        throw new NotFoundError({ message: `The connection "${name}" does not exist.` });
    }

    return handle;
}
