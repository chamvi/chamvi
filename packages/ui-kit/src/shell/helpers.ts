/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { hasPermission } from '../auth/helpers.ts';
import { CONNECTIONS_CREATE_PERMISSION } from '../connections/constants.ts';
import type { ConnectionWire } from '../connections/types.ts';
import type { UiPageWire } from './types.ts';

/**
 * The pages this principal gets a sidebar item for: it may read a connection
 * of the page's type (`GET /connections` lists only those), or may create one.
 */
export function visibleUiPages(
    pages: readonly UiPageWire[],
    connections: readonly ConnectionWire[],
    permissions: readonly string[],
): UiPageWire[] {
    const creator = hasPermission(permissions, CONNECTIONS_CREATE_PERMISSION);
    const readable = new Set(connections.map((connection) => connection.type));

    return pages.filter((page) => creator || page.types.some((type) => readable.has(type)));
}
