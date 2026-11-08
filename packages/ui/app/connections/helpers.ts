/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionStatus } from '@chamvi/core';
import { renderSVG } from 'uqr';
import { hasPermission } from '../auth/helpers.ts';
import { STATUS_BADGES } from './constants.ts';
import type { ConnectionBadge } from './types.ts';

export function statusBadge(status: ConnectionStatus): ConnectionBadge {
    return Object.hasOwn(STATUS_BADGES, status) ? STATUS_BADGES[status] : { label: String(status), tone: 'queued' };
}

/**
 * The QR of `value` as an SVG `data:` URL, rendered in the browser (no
 * network; `img-src data:` is in the dashboard's CSP).
 */
export function qrDataUrl(value: string): string {
    return `data:image/svg+xml,${encodeURIComponent(renderSVG(value, { border: 4 }))}`;
}

/** Widgets (the QR), the live stream and reset need `connection:<name>:write`. */
export function canWriteConnection(permissions: readonly string[], name: string): boolean {
    return hasPermission(permissions, `connection:${name}:write`);
}
