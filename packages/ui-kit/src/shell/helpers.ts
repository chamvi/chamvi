/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Permission, can } from '@chamvi/access';
import type { PermissionHolder } from '@chamvi/access';
import type { ConnectionWire } from '../connections/types.ts';
import type { UiPageWire } from './types.ts';

/**
 * The pages this principal gets a sidebar item for: it may read a connection
 * of the page's type (`GET /connections` lists only those), or may create
 * one of that type (`chamvi_connection_create` for `{ type }`).
 */
export async function visibleUiPages(
    pages: readonly UiPageWire[],
    connections: readonly ConnectionWire[],
    holder: PermissionHolder | undefined,
): Promise<UiPageWire[]> {
    const readable = new Set(connections.map((connection) => connection.type));
    const types = new Set(pages.flatMap((page) => page.types).filter((type) => !readable.has(type)));
    const creatable = new Set<string>();
    const now = new Date();

    if (holder) {
        await Promise.all(Array.from(types, async (type) => {
            if (await can(holder, Permission.CONNECTION_CREATE, { attributes: { type }, now })) {
                creatable.add(type);
            }
        }));
    }

    return pages.filter((page) => page.types.some((type) => readable.has(type) || creatable.has(type)));
}
