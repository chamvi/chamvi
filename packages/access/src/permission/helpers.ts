/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { PERMISSION_NAMES } from './constants.ts';
import type { PermissionBinding, PermissionHolder } from './types.ts';

/**
 * True for an object whose `permission.name` is a non-empty string and whose
 * `policies` are absent or an array of objects with a string `type`.
 */
export function isPermissionBinding(value: unknown): value is PermissionBinding {
    if (!isObject(value)) {
        return false;
    }

    const { permission, policies } = value as Record<string, unknown>;

    if (
        !isObject(permission) ||
        typeof permission.name !== 'string' ||
        permission.name.length === 0
    ) {
        return false;
    }

    if (typeof policies === 'undefined') {
        return true;
    }

    return Array.isArray(policies) &&
        policies.every((policy) => isObject(policy) && typeof policy.type === 'string');
}

/** One unrestricted binding per chamvi permission name, a new array. */
export function allPermissions(): PermissionBinding[] {
    return PERMISSION_NAMES.map((name) => ({ permission: { name } }));
}

/** The distinct names of the holder's valid bindings, in first-seen order. */
export function permissionNames(holder: PermissionHolder): string[] {
    const names: string[] = [];

    for (const binding of readBindings(holder)) {
        if (!names.includes(binding.permission.name)) {
            names.push(binding.permission.name);
        }
    }

    return names;
}

/** The holder's entries that are bindings; anything else grants nothing. */
export function readBindings(holder: unknown): PermissionBinding[] {
    if (!isObject(holder) || !Array.isArray(holder.bindings)) {
        return [];
    }

    return (holder.bindings as unknown[]).filter(isPermissionBinding);
}
