/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IPermissionEvaluator, PermissionEvaluationContext } from '@authup/access';
import {
    BuiltInPolicyType,
    PolicyData,
    createAuthorizationSnapshotEvaluator,
} from '@authup/access';
import { isObject } from 'smob';
import { isPermissionAuthorization, readBindings } from '../permission/helpers.ts';
import type { PermissionCheckOptions, PermissionHolder } from '../permission/types.ts';

/** The evaluators of one holder: absent where a source grants nothing. */
type Evaluators = {
    flat?: IPermissionEvaluator;
    snapshot?: { evaluator: IPermissionEvaluator; realm: string };
};

/** A built pair and the holder fields it was built from. */
type CacheEntry = {
    bindings: unknown;
    authorization: unknown;
    identity: unknown;
    evaluators: Promise<Evaluators>;
};

/**
 * Built evaluators per holder object: the dashboard checks one holder many
 * times. An entry is reused only while the holder still names the same
 * `bindings`, `authorization` and `identity` objects.
 */
const cache = new WeakMap<object, CacheEntry>();

/**
 * True when the holder may do `name` on the resource in `options.attributes`:
 * one of its bindings passes, or its authorization snapshot does. Without
 * attributes a policy over them fails: the check asks about every resource.
 * Never rejects.
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
    try {
        const { flat, snapshot } = await prepare(holder);

        if (flat && await passes(flat, { name, data: buildData(options) }, some)) {
            return true;
        }

        if (!snapshot) {
            return false;
        }

        // the global definition, then the one owned by chamvi's realm; a client-owned one is never asked for
        for (const realmId of [undefined, snapshot.realm]) {
            const data = buildData(options);

            data.set(BuiltInPolicyType.REALM_MATCH, snapshot.realm);

            if (await passes(snapshot.evaluator, {
                name, 
                data, 
                ...(realmId ? { realmId } : {}), 
            }, some)) {
                return true;
            }
        }

        return false;
    } catch {
        return false;
    }
}

async function passes(evaluator: IPermissionEvaluator, ctx: PermissionEvaluationContext, some: boolean): Promise<boolean> {
    try {
        if (some) {
            await evaluator.preEvaluate(ctx);
        } else {
            await evaluator.evaluate(ctx);
        }

        return true;
    } catch {
        return false;
    }
}

async function prepare(holder: PermissionHolder): Promise<Evaluators> {
    if (!isObject(holder)) {
        return {};
    }

    const {
        bindings, 
        authorization, 
        identity, 
    } = holder;
    const cached = cache.get(holder);

    if (
        cached &&
        cached.bindings === bindings &&
        cached.authorization === authorization &&
        cached.identity === identity
    ) {
        return cached.evaluators;
    }

    const evaluators = build(holder);

    cache.set(holder, {
        bindings,
        authorization,
        identity,
        evaluators,
    });

    return evaluators;
}

/** Each source on its own evaluator, so one that does not build grants nothing alone. */
async function build(holder: PermissionHolder): Promise<Evaluators> {
    const [flat, snapshot] = await Promise.all([buildFlat(holder), buildSnapshot(holder)]);

    return {
        ...(flat ? { flat } : {}),
        ...(snapshot ? { snapshot } : {}),
    };
}

/**
 * The bindings as the flat case of a snapshot: no grants, every binding of a
 * name a disjunct. A token has no realm and a flat binding no resource realm:
 * a binding's `realmScope` is not evaluated (a definition carries none), and
 * a binding with a `realmMatch` node anywhere in its tree is dropped (upstream
 * passes such a node neutrally without a resource realm).
 */
async function buildFlat(holder: PermissionHolder): Promise<IPermissionEvaluator | undefined> {
    try {
        const definitions = readBindings(holder).flatMap((binding) => {
            try {
                const definition = toPlainData(binding);

                if (hasRealmMatch(definition.policies)) {
                    return [];
                }

                delete definition.realmScope;

                return [definition];
            } catch {
                // a binding that cannot be copied fails alone
                return [];
            }
        });

        if (definitions.length === 0) {
            return undefined;
        }

        return await createAuthorizationSnapshotEvaluator({
            snapshot: { definitions },
            ...(holder.identity ? { identity: { ...holder.identity } } : {}),
        });
    } catch {
        return undefined;
    }
}

/** The snapshot of an authup login; grants nothing without an identity it belongs to. */
async function buildSnapshot(holder: PermissionHolder): Promise<Evaluators['snapshot']> {
    try {
        const { authorization, identity } = holder;

        if (!isPermissionAuthorization(authorization) || !isObject(identity)) {
            return undefined;
        }

        const evaluator = await createAuthorizationSnapshotEvaluator({
            snapshot: toPlainData(authorization.snapshot),
            identity: { ...identity } as NonNullable<PermissionHolder['identity']>,
        });

        return { evaluator, realm: authorization.realm };
    } catch {
        return undefined;
    }
}

function buildData(options: PermissionCheckOptions): PolicyData {
    const data = new PolicyData();

    if (options.attributes) {
        data.set(BuiltInPolicyType.ATTRIBUTES, { ...options.attributes });
    }

    if (options.now) {
        data.set(BuiltInPolicyType.DATE, new Date(options.now));
        data.set(BuiltInPolicyType.TIME, new Date(options.now));
    }

    return data;
}

/**
 * A plain JSON copy, read through proxies (a reactive store hands those out,
 * and the evaluator's validation refuses them); a `Date` becomes its epoch
 * milliseconds, as in a snapshot. A cycle throws.
 */
function toPlainData<T>(value: T): T {
    return JSON.parse(JSON.stringify(value, function replace(this: Record<string, unknown>, key: string, item: unknown) {
        const raw = this[key];

        return raw instanceof Date ? raw.getTime() : item;
    })) as T;
}

/** True when a policy list holds a `realmMatch` node at any depth. */
function hasRealmMatch(policies: unknown): boolean {
    if (!Array.isArray(policies)) {
        return false;
    }

    return policies.some((policy) => isObject(policy) &&
        (policy.type === BuiltInPolicyType.REALM_MATCH || hasRealmMatch(policy.children)));
}
