/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import type { McpRequestExtra } from '../types.ts';

/** The principal and request signal the route put on `authInfo.extra`. */
export function readRequestExtra(extra: Record<string, unknown> | undefined): McpRequestExtra | undefined {
    if (!isObject(extra) || !isObject(extra.principal) || !(extra.signal instanceof AbortSignal)) {
        return undefined;
    }

    return extra as unknown as McpRequestExtra;
}
