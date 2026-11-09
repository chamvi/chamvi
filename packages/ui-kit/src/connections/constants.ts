/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionStatus } from '@chamvi/core';
import type { ConnectionBadge } from './types.ts';

/** How often the list (and a reader's detail, which has no stream) refreshes. */
export const CONNECTIONS_POLL_MS = 15_000;

/** Every `ConnectionStatus` as a chip; an unknown one renders as is, muted. */
export const STATUS_BADGES: Record<ConnectionStatus, ConnectionBadge> = {
    disconnected: { label: 'disconnected', tone: 'cancelled' },
    pairing: { label: 'pairing', tone: 'waiting' },
    connecting: { label: 'connecting', tone: 'running' },
    connected: { label: 'connected', tone: 'completed' },
    logged_out: { label: 'logged out', tone: 'failed' },
    held_elsewhere: { label: 'held elsewhere', tone: 'waiting' },
    failed: { label: 'failed', tone: 'failed' },
};
