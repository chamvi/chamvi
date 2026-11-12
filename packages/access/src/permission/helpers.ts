/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isPermissionPolicyBinding } from '@authup/access';
import { isObject } from 'smob';
import { PERMISSION_NAMES } from './constants.ts';
import type { PermissionAuthorization, PermissionBinding, PermissionHolder } from './types.ts';

/**
 * True for an object with a non-empty string `realm` and a `snapshot` whose
 * `definitions` are bindings and whose `grants` are absent or bindings. A
 * shallow check: the evaluator validates the policy trees when a check runs.
 */
export function isPermissionAuthorization(value: unknown): value is PermissionAuthorization {
    if (!isObject(value) || typeof value.realm !== 'string' || value.realm.length === 0) {
        return false;
    }

    const { snapshot } = value;

    if (!isObject(snapshot) || !isBindingList(snapshot.definitions)) {
        return false;
    }

    return typeof snapshot.grants === 'undefined' || isBindingList(snapshot.grants);
}

/** One unrestricted binding per chamvi permission name, a new array. */
export function allPermissions(): PermissionBinding[] {
    return PERMISSION_NAMES.map((name) => ({ permission: { name } }));
}

/**
 * The distinct names the holder holds, in first-seen order: those of its
 * valid bindings, then those of its snapshot's grants (never of its
 * definitions). For display only: a grant may still be restricted.
 */
export function permissionNames(holder: PermissionHolder): string[] {
    const names: string[] = [];

    for (const binding of [...readBindings(holder), ...readGrants(holder)]) {
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

    return (holder.bindings as unknown[]).filter((entry) => isPermissionPolicyBinding(entry));
}

/** The grants of the holder's snapshot, none when its authorization is malformed. */
function readGrants(holder: unknown): PermissionBinding[] {
    if (!isObject(holder) || !isPermissionAuthorization(holder.authorization)) {
        return [];
    }

    return [...holder.authorization.snapshot.grants ?? []];
}

function isBindingList(value: unknown): value is PermissionBinding[] {
    return Array.isArray(value) && value.every((entry) => isPermissionPolicyBinding(entry));
}
