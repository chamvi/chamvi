/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ValidationError } from '@chamvi/errors';
import type { TriggerSource } from '@chamvi/core-kit';
import { isObject } from 'smob';
import { assertDispatchKey } from './keys.ts';

/**
 * `dispatch()`'s `source` checked and copied: an object of exactly a
 * registered `channel` and a non-empty `address` within the trigger key
 * limits; undefined when not given.
 */
export function readDispatchSource(value: unknown, hasChannel: (name: string) => boolean): TriggerSource | undefined {
    if (value === undefined) {
        return undefined;
    }

    const hasOtherKey = isObject(value) && Object.keys(value).some((key) => key !== 'channel' && key !== 'address');

    if (!isObject(value) || hasOtherKey) {
        throw new ValidationError('The dispatch source must be an object of a channel and an address.');
    }

    const { channel, address } = value as Record<string, unknown>;

    if (typeof channel !== 'string' || !hasChannel(channel)) {
        throw new ValidationError(`The dispatch source channel "${String(channel)}" is not registered.`);
    }

    assertDispatchKey('source address', address, true);

    if (address === undefined) {
        throw new ValidationError('The dispatch source needs an address.');
    }

    return { channel, address };
}
