/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { BuiltInPolicyType, PolicyData, isPermissionError } from '@authup/access';
import { ForbiddenError } from '@chamvi/errors';
import type { ActorContext } from './types.ts';

/**
 * Whether the actor holds `name` for the resource `attributes`; without
 * attributes, for a resource the check needs no attributes for. Only a
 * permission error means "no": any other evaluator failure propagates.
 */
export async function isActorGranted(
    actor: ActorContext<unknown>,
    name: string,
    attributes?: Record<string, unknown>,
): Promise<boolean> {
    let data: PolicyData | undefined;

    if (attributes !== undefined) {
        data = new PolicyData();
        data.set(BuiltInPolicyType.ATTRIBUTES, attributes);
    }

    try {
        await actor.permissionEvaluator.evaluate({ name, ...(data ? { data } : {}) });

        return true;
    } catch (error) {
        if (isPermissionError(error)) {
            return false;
        }

        throw error;
    }
}

/** Whether the actor holds `name` for some resource (a collection gate). */
export async function isActorGrantedSome(actor: ActorContext<unknown>, name: string): Promise<boolean> {
    try {
        await actor.permissionEvaluator.preEvaluate({ name });

        return true;
    } catch (error) {
        if (isPermissionError(error)) {
            return false;
        }

        throw error;
    }
}

/** The 403 of a permission the actor does not hold. */
export function forbidden(permission: string): ForbiddenError {
    return new ForbiddenError({ message: `Missing permission "${permission}".` });
}
