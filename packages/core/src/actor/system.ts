/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { SystemPermissionEvaluator } from './evaluator.ts';
import type { ActorContext } from './types.ts';

// the actors createSystemActor() built: recognized by the object, never by
// its identity, which a custom authenticator could copy
const SYSTEM_ACTORS = new WeakSet<object>();

/**
 * The actor of engine and app code acting on its own: it holds every
 * permission. Only engine and app code builds one (eslint refuses the import
 * elsewhere); no request path yields it.
 */
export function createSystemActor(): ActorContext {
    const actor: ActorContext = {
        permissionEvaluator: new SystemPermissionEvaluator(),
        identity: {
            id: 'system',
            kind: 'system',
            bindings: [],
        },
    };

    SYSTEM_ACTORS.add(actor);

    return actor;
}

/** Whether `actor` is an object createSystemActor() built (a copy is not). */
export function isSystemActor(actor: unknown): boolean {
    return isObject(actor) && SYSTEM_ACTORS.has(actor);
}
