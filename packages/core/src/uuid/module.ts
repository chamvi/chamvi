/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { ValidationError } from '../errors/index.ts';

/** UUID v7 using the caller's clock and 74 random bits, including on Node 26.0. */
export function randomUuidV7(milliseconds: number = Date.now()): string {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 0xffffffffffff) {
        throw new ValidationError('UUID v7 requires integer milliseconds between 0 and 281474976710655.');
    }

    const timestamp = milliseconds.toString(16).padStart(12, '0');

    return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${randomUUID().slice(15)}`;
}

export function isUuidV7(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
