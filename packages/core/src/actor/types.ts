/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IPermissionEvaluator, PermissionPolicyBinding } from '@authup/access';
import type { Invoker } from '@chamvi/core-kit';

/**
 * What a service receives instead of a request (authup's shape): the
 * evaluator that decides for the caller, and who the caller is. For a
 * request, `identity` is the principal as an invoker, so a service passes it
 * on as the invoker or approver of what it changes.
 */
export type ActorContext<TIdentity = Invoker> = {
    permissionEvaluator: IPermissionEvaluator;
    identity?: TIdentity;
    /** The actor's own grants (authup's shape); chamvi delegates no grants and leaves it unset. */
    grants?: () => Promise<PermissionPolicyBinding[]>;
};
