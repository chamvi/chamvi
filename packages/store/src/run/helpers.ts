/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { WaitPoint } from './types.ts';

/**
 * A stored wait point as it reads today: an approval wait point written
 * without the generic `id` gets `id = approvalId`. The input is not changed;
 * repository implementations call it on every wait point they read back.
 */
export function normalizeWaitPoint(raw: Record<string, unknown>): WaitPoint {
    if (raw.kind === 'approval' && raw.id === undefined && typeof raw.approvalId === 'string') {
        return { ...raw, id: raw.approvalId } as WaitPoint;
    }

    return raw as WaitPoint;
}
