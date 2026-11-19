/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { V1Pod } from '@kubernetes/client-node';
import { isObject } from 'smob';
import { isApiStatus } from '../../client/helpers.ts';
import { podState } from '../helpers.ts';

/** True for a client error of HTTP status `code`, the ApiException itself or as the cause. */
export function isStatus(error: unknown, code: number): boolean {
    return isApiStatus(error, code) || (isObject(error) && isApiStatus(error.cause, code));
}

/** The message of `error`, also for a thrown non-error. */
export function messageOf(error: unknown): string {
    return Error.isError(error) ? error.message : String(error);
}

/** True for a pod that is gone or going: being deleted, failed or finished. */
export function isEnded(pod: V1Pod): boolean {
    return Boolean(pod.metadata?.deletionTimestamp) || podState(pod).state === 'failed';
}
