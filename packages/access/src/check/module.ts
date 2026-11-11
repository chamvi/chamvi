/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    IPermissionProvider,
    PermissionGrant,
    PolicyEvaluators,
    PolicyValidators,
} from '@authup/access';
import {
    BuiltInPolicyType,
    PermissionEvaluator,
    PolicyData,
    PolicyDefaultEvaluators,
    PolicyDefaultValidators,
    PolicyEngine,
    projectAuthorizationPolicy,
} from '@authup/access';
import { readBindings } from '../permission/helpers.ts';
import type { PermissionBinding, PermissionCheckOptions, PermissionHolder } from '../permission/types.ts';
import { copyPolicy, guardEvaluators, isEvaluable } from './helpers.ts';

/**
 * The default evaluators without `permissionBinding`: a binding carries its
 * own grant, so such a node is never answerable here (see `isEvaluable`).
 */
const EVALUATORS: PolicyEvaluators = withoutBindingCheck(PolicyDefaultEvaluators);

/** The configuration validators of the same types: a node that fails one is never evaluated. */
const VALIDATORS: PolicyValidators = withoutBindingCheck(PolicyDefaultValidators);

/**
 * True when at least one of the holder's bindings named `name` passes for the
 * resource in `options.attributes`. Without attributes a policy over them
 * fails: the check asks about every resource. Never rejects.
 */
export async function can(holder: PermissionHolder, name: string, options: PermissionCheckOptions = {}): Promise<boolean> {
    return check(holder, name, options, false);
}

/**
 * Like `can`, but a policy whose data is missing (no attributes, no identity)
 * counts as passed: true when the holder may do `name` on some resource.
 * Only a policy that already fails denies. Never rejects.
 */
export async function canSome(holder: PermissionHolder, name: string, options: PermissionCheckOptions = {}): Promise<boolean> {
    return check(holder, name, options, true);
}

async function check(holder: PermissionHolder, name: string, options: PermissionCheckOptions, some: boolean): Promise<boolean> {
    let bindings: PermissionBinding[];

    try {
        bindings = readBindings(holder).filter((binding) => binding.permission.name === name);
    } catch {
        return false;
    }

    for (const binding of bindings) {
        if (await passes(holder, binding, options, some)) {
            return true;
        }
    }

    return false;
}

/**
 * One binding on its own engine, so that a binding which cannot be copied or
 * evaluated fails alone and its siblings still decide. A tree with a node the
 * engine cannot answer, or one whose evaluation malfunctioned anywhere (even
 * below an inverted composite), fails the binding.
 */
async function passes(holder: PermissionHolder, binding: PermissionBinding, options: PermissionCheckOptions, some: boolean): Promise<boolean> {
    try {
        const flag = { broken: false };
        const grant = toGrant(binding);

        if (grant.policy) {
            if (!isEvaluable(grant.policy, EVALUATORS)) {
                return false;
            }

            // Validates every node, composite children included; throws on the first bad one.
            await projectAuthorizationPolicy(grant.policy, VALIDATORS);
        }

        const { name } = binding.permission;
        const provider: IPermissionProvider = { findOne: async () => ({ permission: { name }, grants: [grant] }) };
        const evaluator = new PermissionEvaluator({ provider, policyEngine: new PolicyEngine(guardEvaluators(EVALUATORS, flag)) });
        const ctx = { name, data: buildData(holder, options) };

        if (some) {
            await evaluator.preEvaluate(ctx);
        } else {
            await evaluator.evaluate(ctx);
        }

        return !flag.broken;
    } catch {
        return false;
    }
}

/** A binding as one grant: its policies (a copy) as one composite, none for an unrestricted binding. */
function toGrant(binding: PermissionBinding): PermissionGrant {
    if (!binding.policies || binding.policies.length === 0) {
        return { realmScope: 'any' };
    }

    const policy = {
        type: BuiltInPolicyType.COMPOSITE,
        decisionStrategy: binding.permission.decisionStrategy ?? undefined,
        children: copyPolicy(binding.policies),
    };

    return { realmScope: 'any', policy };
}

function withoutBindingCheck<T>(registry: Readonly<Record<string, T>>): Record<string, T> {
    return Object.fromEntries(Object.entries(registry)
        .filter(([type]) => type !== BuiltInPolicyType.PERMISSION_BINDING));
}

function buildData(holder: PermissionHolder, options: PermissionCheckOptions): PolicyData {
    const data = new PolicyData();

    if (options.attributes) {
        data.set(BuiltInPolicyType.ATTRIBUTES, { ...options.attributes });
    }

    if (holder.identity) {
        data.set(BuiltInPolicyType.IDENTITY, { ...holder.identity });
    }

    if (options.now) {
        data.set(BuiltInPolicyType.DATE, new Date(options.now));
        data.set(BuiltInPolicyType.TIME, new Date(options.now));
    }

    return data;
}
