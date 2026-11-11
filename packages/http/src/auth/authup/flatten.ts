/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type {
    AuthorizationCatalog,
    AuthorizationDefinition,
    AuthorizationGrant,
    AuthorizationPolicy,
    BasePolicy,
} from '@authup/access';
import {
    AuthorizationCatalogStaleError,
    BuiltInPolicyType,
    authorizationCatalogSchema,
    authorizationGrantSchema,
    buildPermissionKey,
    containsBindingCheck,
    projectAuthorizationPolicy,
    realmScopeMatches,
} from '@authup/access';
import type { PermissionBinding, PermissionIdentity } from '@chamvi/access';
import { isObject } from 'smob';

type FlattenInput = {
    /** authup's `GET /authorization` body. */
    catalog: unknown;
    /** The introspected grants (`permissions` of the token). */
    grants: unknown;
    identity: PermissionIdentity;
    /** The realm chamvi's resources belong to. */
    realm: string;
};

/**
 * A catalog parsed once: each definition by its permission key (`null` when
 * none of its grants can be evaluated) and each policy tree by id (`null`
 * when this copy cannot project it).
 */
type PreparedCatalog = {
    definitions: Map<string, AuthorizationDefinition | null>;
    trees: Map<string, AuthorizationPolicy | null>;
};

/** What reducing a definition tree yields: the tree, `null` when removed, `false` when not expressible. */
type Reduced = AuthorizationPolicy | null | false;

const UNANIMOUS = 'unanimous';

/** Keyed by the catalog object the cache hands out, so a document is parsed and projected once. */
const prepared = new WeakMap<object, Promise<PreparedCatalog>>();

/**
 * Turns the introspected grants of an authup identity into self-contained
 * bindings: per grant the definition-layer trees (with the binding check
 * removed, since the binding list itself answers it) and then the grant's
 * junction trees, resolved from the catalog. Realm reach is settled here
 * against `realm`. A grant this cannot express exactly is dropped; a grant
 * naming a definition or policy the catalog lacks throws
 * `AuthorizationCatalogStaleError` (refetch the catalog).
 */
export async function flattenGrants(input: FlattenInput): Promise<PermissionBinding[]> {
    const catalog = await prepare(input.catalog);
    const grants = Array.isArray(input.grants) ? input.grants as unknown[] : [];
    const bindings: PermissionBinding[] = [];

    for (const raw of grants) {
        const parsed = authorizationGrantSchema.safeParse(raw);

        if (!parsed.success) {
            continue;
        }

        const binding = flattenGrant(catalog, parsed.data as AuthorizationGrant, input);

        if (binding) {
            bindings.push(structuredClone(binding));
        }
    }

    return bindings;
}

function flattenGrant(catalog: PreparedCatalog, grant: AuthorizationGrant, input: FlattenInput): PermissionBinding | undefined {
    const key = buildPermissionKey({
        name: grant.name,
        realmId: grant.realm_id ?? null,
        clientId: grant.client_id ?? null,
    });
    const definition = catalog.definitions.get(key);

    if (typeof definition === 'undefined') {
        throw new AuthorizationCatalogStaleError(`The catalog does not define the permission ${key}.`);
    }

    // as authup's own consumer: an unevaluable definition or tree drops the grant before a later id can read as stale
    if (definition === null) {
        return undefined;
    }

    const junction: AuthorizationPolicy[] = [];

    for (const id of grant.policies ?? []) {
        const tree = catalog.trees.get(id);

        if (typeof tree === 'undefined') {
            throw new AuthorizationCatalogStaleError(`The catalog does not declare the policy ${id}.`);
        }

        if (tree === null || containsBindingCheck(tree)) {
            return undefined;
        }

        junction.push(tree);
    }

    if (
        (definition.realmId !== null && definition.realmId !== input.realm) ||
        definition.clientId !== null
    ) {
        return undefined;
    }

    if (!realmScopeMatches(grant.realm_scope, input.realm, input.identity.realmId, input.identity.realmName)) {
        return undefined;
    }

    const strategy = definition.decisionStrategy ?? undefined;
    const conjunctive = !strategy || strategy === UNANIMOUS;
    const ids = definition.policies ?? [];
    // the definition's own strategy joins its trees: a conjunction when unanimous or when there is one tree
    const root = conjunctive || ids.length === 1;
    const layer: AuthorizationPolicy[] = [];

    for (const id of ids) {
        // a projected tree: prepare() nulls a definition whose trees did not project
        const reduced = reduce(catalog.trees.get(id)!, root);

        if (reduced === false) {
            return undefined;
        }

        if (reduced) {
            layer.push(reduced);
        }
    }

    const grantLayer = junction.map((tree) => reduce(tree, true) as AuthorizationPolicy);
    const policies = conjunctive ?
        [...layer, ...grantLayer] :
        conjoin([...combine(layer, strategy), ...combine(grantLayer, strategy)]);

    return {
        permission: {
            name: definition.name,
            ...(strategy ? { decisionStrategy: strategy } : {}),
        },
        ...(policies.length > 0 ? { policies: policies as BasePolicy[] } : {}),
    };
}

/**
 * Removes the `permissionBinding` nodes of a definition tree. A removed node
 * is answered by the binding list, which is exact only where the tree is a
 * conjunction down to that node: no `invert` on the way and only unanimous
 * composites. Anywhere else the tree is not expressible (`false`). A
 * composite left without children is removed, one left with a single child
 * becomes that child. `invert` is kept only when it is a boolean.
 */
function reduce(node: AuthorizationPolicy, conjunctive: boolean): Reduced {
    const inverted = node.invert === true;

    if (node.type === BuiltInPolicyType.PERMISSION_BINDING) {
        return conjunctive && !inverted ? null : false;
    }

    const {
        invert, 
        children, 
        ...rest 
    } = node;
    const output: AuthorizationPolicy = { ...rest, ...(typeof invert === 'boolean' ? { invert } : {}) };

    if (node.type !== BuiltInPolicyType.COMPOSITE || !children) {
        return output;
    }

    const inner = conjunctive && !inverted && (node.decisionStrategy ?? UNANIMOUS) === UNANIMOUS;
    const kept: AuthorizationPolicy[] = [];
    let removed = false;

    for (const child of children) {
        const next = reduce(child, inner);

        if (next === false) {
            return false;
        }

        if (next === null) {
            removed = true;
        } else {
            kept.push(next);
        }
    }

    if (removed && kept.length <= 1) {
        // only a non-inverted unanimous composite loses a child, so this is exact
        return kept[0] ?? null;
    }

    return { ...output, children: kept };
}

/** One layer's trees as the definition combines them: alone, or as a composite with its strategy. */
function combine(trees: AuthorizationPolicy[], strategy: string | undefined): AuthorizationPolicy[] {
    if (trees.length <= 1) {
        return trees;
    }

    return [{
        type: BuiltInPolicyType.COMPOSITE, 
        decisionStrategy: strategy, 
        children: trees, 
    }];
}

/** The definition layer and the grant layer both have to pass, whatever the permission's strategy. */
function conjoin(trees: AuthorizationPolicy[]): AuthorizationPolicy[] {
    if (trees.length <= 1) {
        return trees;
    }

    return [{
        type: BuiltInPolicyType.COMPOSITE, 
        decisionStrategy: UNANIMOUS, 
        children: trees, 
    }];
}

async function prepare(catalog: unknown): Promise<PreparedCatalog> {
    if (!isObject(catalog)) {
        return build(catalog);
    }

    let entry = prepared.get(catalog);

    if (!entry) {
        entry = build(catalog);
        prepared.set(catalog, entry);
        entry.catch(() => prepared.delete(catalog));
    }

    return entry;
}

/**
 * Parses the catalog (throws on a malformed one) and projects every tree
 * with authup's own projection. A definition is unevaluable (`null`) when
 * its `policies` is `null`, names a tree that did not project or that the
 * catalog does not declare, or when its permission key appears twice.
 */
async function build(input: unknown): Promise<PreparedCatalog> {
    const catalog = authorizationCatalogSchema.parse(structuredClone(input)) as AuthorizationCatalog;
    const trees = new Map<string, AuthorizationPolicy | null>();

    for (const [id, raw] of Object.entries(catalog.policies)) {
        try {
            trees.set(id, await projectAuthorizationPolicy(raw));
        } catch {
            trees.set(id, null);
        }
    }

    const definitions = new Map<string, AuthorizationDefinition | null>();

    for (const definition of catalog.permissions) {
        const key = buildPermissionKey({
            name: definition.name,
            realmId: definition.realmId,
            clientId: definition.clientId,
        });

        if (definitions.has(key)) {
            definitions.set(key, null);

            continue;
        }

        const evaluable = definition.policies !== null &&
            definition.policies.every((id) => Object.hasOwn(catalog.policies, id) && trees.get(id));

        definitions.set(key, evaluable ? definition : null);
    }

    return { definitions, trees };
}
