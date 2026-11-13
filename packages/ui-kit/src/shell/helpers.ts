/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission } from '@chamvi/access';
import type { ConnectionWire } from '../connections/types.ts';
import type { UiPageWire } from './types.ts';

/**
 * The pages this principal gets a sidebar item for: it may read a connection
 * of the page's type (`GET /connections` lists only those), or it is allowed
 * `chamvi_connection_create` (an upper bound: the create route decides per
 * type).
 */
export function visibleUiPages(
    pages: readonly UiPageWire[],
    connections: readonly ConnectionWire[],
    allowed: (name: string) => boolean,
): UiPageWire[] {
    if (allowed(Permission.CONNECTION_CREATE)) {
        return [...pages];
    }

    const readable = new Set(connections.map((connection) => connection.type));

    return pages.filter((page) => page.types.some((type) => readable.has(type)));
}
