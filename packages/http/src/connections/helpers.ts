/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { hasPermission } from '@chamvi/core';
import type { IConnectionHandle } from '@chamvi/core';
import { ForbiddenError, NotFoundError } from '@ebec/http';
import type { HttpContext } from '../app/types.ts';
import { connectionPermission } from '../auth/module.ts';
import type { Principal } from '../auth/types.ts';
import type { ConnectionView } from './types.ts';

/** `connection:<name>:write`. */
export function canWrite(principal: Principal, name: string): boolean {
    return hasPermission(principal.permissions, connectionPermission(name, 'write'));
}

/** `connection:<name>:read` or `:write` (write implies read). */
export function canRead(principal: Principal, name: string): boolean {
    return canWrite(principal, name) || hasPermission(principal.permissions, connectionPermission(name, 'read'));
}

/** The handle of `name` the principal may read (404, then 403), or may write with `write`. */
export function requireHandle(ctx: HttpContext, principal: Principal, name: string, write = false): IConnectionHandle {
    const handle = ctx.connections().find((candidate) => candidate.name === name);

    if (!handle) {
        throw new NotFoundError({ message: `The connection "${name}" does not exist.` });
    }

    if (write ? !canWrite(principal, name) : !canRead(principal, name)) {
        throw new ForbiddenError({ message: `Missing permission "${connectionPermission(name, write ? 'write' : 'read')}".` });
    }

    return handle;
}

export function serializeConnection(handle: IConnectionHandle): ConnectionView {
    return {
        name: handle.name,
        type: handle.type,
        status: handle.status(),
    };
}
