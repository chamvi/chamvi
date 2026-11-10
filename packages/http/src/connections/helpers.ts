/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { hasPermission } from '@chamvi/core';
import type { IConnectionHandle } from '@chamvi/core';
import { IssueCode } from '@ebec/core';
import { ForbiddenError, NotFoundError } from '@ebec/http';
import { isObject } from 'smob';
import { createValidupError, defineValidator } from 'validup';
import type { ValidatorDescriptor } from 'validup';
import type { IAppEvent } from 'routup';
import type { HttpContext } from '../app/types.ts';
import { connectionPermission } from '../auth/module.ts';
import type { Principal } from '../auth/types.ts';
import type { ConnectionView } from './types.ts';

export function param(event: IAppEvent, name: string): string {
    return event.params[name] ?? '';
}

/** `connection:<name>:write`. */
export function canWrite(principal: Principal, name: string): boolean {
    return hasPermission(principal.permissions, connectionPermission(name, 'write'));
}

/** `connection:<name>:read` or `:write` (write implies read). */
export function canRead(principal: Principal, name: string): boolean {
    return canWrite(principal, name) || hasPermission(principal.permissions, connectionPermission(name, 'read'));
}

/** 403 unless the principal may read `name`, or may write it with `write`: before any lookup, so a refusal says nothing about the name. */
export function assertConnectionAccess(principal: Principal, name: string, write = false): void {
    if (write ? !canWrite(principal, name) : !canRead(principal, name)) {
        throw new ForbiddenError({ message: `Missing permission "${connectionPermission(name, write ? 'write' : 'read')}".` });
    }
}

/** The handle of `name` the principal may read (403, then 404), or may write with `write`. */
export function requireHandle(ctx: HttpContext, principal: Principal, name: string, write = false): IConnectionHandle {
    assertConnectionAccess(principal, name, write);

    const handle = ctx.connections().find((candidate) => candidate.name === name);

    if (!handle) {
        throw new NotFoundError({ message: `The connection "${name}" does not exist.` });
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

/*
 * Connection bodies carry secrets and may place them anywhere: these
 * validators, and the field checks of `config.ts`, never echo a value.
 */

/** A plain object, with its values left to the caller. */
export function isRecord(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (!isObject(value)) {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, 'must be an object');
            }

            return value;
        },
    });
}

/** The longest connection name: an account id is never longer than the name built from it. */
const ACCOUNT_ID_MAX_LENGTH = 64;

/** A create's account id; the name it builds is checked by the connection-name rule. */
export function isAccountId(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (typeof value !== 'string' || value.length === 0 || value.length > ACCOUNT_ID_MAX_LENGTH || value.includes('\0')) {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, `must be a string of 1 to ${ACCOUNT_ID_MAX_LENGTH} characters`);
            }

            return value;
        },
    });
}

/** `{ set?: { <field>: string }, clear?: string[] }` of a save. */
export function isSecretsWrite(): ValidatorDescriptor {
    return defineValidator({
        run: ({ value }) => {
            if (!isObject(value)) {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, 'must be an object');
            }

            const { set, clear } = value;

            if (set !== undefined && !isObject(set)) {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, 'set must be an object');
            }

            const isNameList = Array.isArray(clear) && clear.every((field) => typeof field === 'string');

            if (clear !== undefined && !isNameList) {
                throw createValidupError(undefined, IssueCode.VALUE_INVALID, 'clear must be an array of field names');
            }

            return { ...(set !== undefined && { set }), ...(clear !== undefined && { clear }) };
        },
    });
}
