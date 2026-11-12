/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { allPermissions, isPermissionBinding } from '@chamvi/access';
import type { PermissionBinding } from '@chamvi/access';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { readBearerToken } from '../helpers.ts';
import type { Authenticator, Principal } from '../types.ts';
import { STATIC_TOKEN_MIN_LENGTH } from './constants.ts';
import { hashToken } from './helpers.ts';
import type { StaticTokensOptions } from './types.ts';

/**
 * The bindings a token's `permissions` stand for, a copy: `'*'` is every
 * chamvi permission unrestricted. Anything but `'*'` or an array of bindings
 * is a configuration error.
 */
function readPermissions(id: string, permissions: unknown): PermissionBinding[] {
    if (permissions === '*') {
        return allPermissions();
    }

    const isBindingList = Array.isArray(permissions) && permissions.every((permission) => isPermissionBinding(permission));

    if (isBindingList) {
        try {
            return structuredClone(permissions);
        } catch {
            // a binding holding a function or another value structuredClone refuses
        }
    }

    throw new InvalidAgentDefinitionError(
        `Static token "${id}": permissions must be "*" or an array of permission bindings ({ permission: { name }, policies? }).`,
    );
}

/**
 * Bearer tokens configured up front (CI, OpenClaw). Tokens are looked up by
 * their SHA-256, never compared as strings. An unknown token resolves
 * `undefined`, so the chain continues. A token's `permissions` are `'*'`
 * (every chamvi permission, unrestricted) or bindings, kept as configured.
 */
export function staticTokens(options: StaticTokensOptions): Authenticator {
    const { tokens } = options;

    if (!Array.isArray(tokens) || tokens.length === 0) {
        throw new InvalidAgentDefinitionError('staticTokens() needs a non-empty array of tokens.');
    }

    const principals = new Map<string, Principal>();

    for (const {
        value,
        id,
        permissions,
    } of tokens) {
        if (typeof id !== 'string' || id.length === 0) {
            throw new InvalidAgentDefinitionError('Every static token needs a non-empty id.');
        }

        if (typeof value !== 'string' || value.length < STATIC_TOKEN_MIN_LENGTH) {
            throw new InvalidAgentDefinitionError(
                `The static token of "${id}" must have at least ${STATIC_TOKEN_MIN_LENGTH} characters.`,
            );
        }

        const digest = hashToken(value);

        if (principals.has(digest)) {
            // a later entry would silently take over the earlier one's grants
            throw new InvalidAgentDefinitionError(`The static token of "${id}" is given more than once.`);
        }

        principals.set(digest, {
            id,
            kind: 'token',
            bindings: readPermissions(id, permissions),
        });
    }

    return async (request) => {
        const token = readBearerToken(request);

        if (token === undefined) {
            return undefined;
        }

        const principal = principals.get(hashToken(token));

        return principal ? { ...principal, bindings: structuredClone(principal.bindings) } : undefined;
    };
}
