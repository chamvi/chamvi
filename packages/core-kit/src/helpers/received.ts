/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RECEIVED_MAX_LENGTH } from './constants.ts';

/** `value` when its JSON has at most RECEIVED_MAX_LENGTH characters, else undefined. */
export function boundReceived(value: unknown): unknown {
    if (value === undefined) {
        return undefined;
    }

    try {
        const json = JSON.stringify(value);

        return json !== undefined && json.length <= RECEIVED_MAX_LENGTH ? value : undefined;
    } catch {
        return undefined;
    }
}
