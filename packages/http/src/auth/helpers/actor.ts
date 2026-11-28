/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { HolderPermissionEvaluator } from '@chamvi/access';
import type { ActorContext, IClock } from '@chamvi/core';
import type { Principal } from '../types.ts';
import { toInvoker } from './principal.ts';

/**
 * The actor a core service checks a request's principal with (authup's
 * `buildActorContext`): an evaluator over the principal itself, at the
 * clock's time, and the principal as an invoker. Never the system actor.
 */
export function buildActorContext(principal: Principal, clock: IClock): ActorContext {
    return {
        permissionEvaluator: new HolderPermissionEvaluator(principal, { now: () => new Date(clock.now()) }),
        identity: toInvoker(principal),
    };
}
