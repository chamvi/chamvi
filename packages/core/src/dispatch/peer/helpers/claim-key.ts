/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { TRIGGER_KEY_MAX_LENGTH } from '../../../trigger/constants.ts';

/**
 * The idempotency key a peer's start claims: `peer:<key>`, or
 * `peer-sha256:<hex>` of it above 255 characters. Disjoint from claimKey()
 * by construction (no `dispatch:` or `sha256:` prefix), so a peer cannot
 * squat a local dispatch's key under the same invoker and channel.
 */
export function peerClaimKey(key: string): string {
    const prefixed = `peer:${key}`;

    if (prefixed.length <= TRIGGER_KEY_MAX_LENGTH) {
        return prefixed;
    }

    return `peer-sha256:${createHash('sha256').update(prefixed).digest('hex')}`;
}
