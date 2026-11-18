/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';

/** The `data` array of a list answer, `[]` for any other body. */
export function dataOf<T>(body: unknown): T[] {
    return isObject(body) && Array.isArray(body.data) ? body.data as T[] : [];
}
