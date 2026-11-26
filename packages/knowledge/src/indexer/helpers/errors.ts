/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ErrorCode } from '@chamvi/errors';
import { isObject } from 'smob';

export function messageOf(error: unknown): string {
    return Error.isError(error) ? error.message : String(error);
}

/** A write refused for a fence another owner claimed (LeaseLostError, by code across core copies). */
export function isLeaseLost(error: unknown): boolean {
    return isObject(error) && error.code === ErrorCode.LEASE_LOST;
}

/** A write refused for a row deleted meanwhile (RepositoryNotFoundError, by code across core copies). */
export function isRepositoryNotFound(error: unknown): boolean {
    return isObject(error) && error.code === ErrorCode.REPOSITORY_NOT_FOUND;
}

/** A configuration error (InvalidAgentDefinitionError, by code across core copies): retrying cannot help. */
export function isConfigurationError(error: unknown): boolean {
    return isObject(error) && error.code === ErrorCode.INVALID_AGENT_DEFINITION;
}
