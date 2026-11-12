/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { isObject } from 'smob';
import { onScopeDispose, shallowRef } from 'vue';
import { asApiError, retryDelayOf } from '../api/helpers.ts';
import { useResolved } from '../auth/composables.ts';
import { createConnectionsApi } from '../connections/api.ts';
import { useConnections } from '../connections/composables.ts';
import { CONNECTIONS_POLL_MS } from '../connections/constants.ts';
import type { ConnectionTypeWire } from '../connections/types.ts';
import { useAppContext } from '../context/module.ts';
import { createPoller } from '../polling/module.ts';
import { visibleUiPages } from './helpers.ts';
import type { UiPageWire } from './types.ts';

/**
 * The registered `*-ui` pages this principal gets a sidebar item for, with
 * the connection types and the readable connections behind them. Pages and
 * types do not change while the app runs: read once, retried until it worked;
 * the connections poll.
 */
export function useUiPages() {
    const { client, session } = useAppContext();
    const {
        connections,
        loaded,
        refresh,
    } = useConnections(createConnectionsApi(client));
    const registered = shallowRef<UiPageWire[]>([]);
    const types = shallowRef<ConnectionTypeWire[]>([]);
    const typesLoaded = shallowRef(false);

    const read = async <T>(url: string): Promise<T[]> => {
        const body: unknown = await (await client.send(url)).json();

        return isObject(body) && Array.isArray(body.data) ? body.data as T[] : [];
    };

    // one poller per list: a failing or stalled page list never holds back the types an add form waits for
    const readOnce = <T>(url: string, apply: (items: T[]) => void) => {
        const poller = createPoller(async () => {
            try {
                apply(await read<T>(url));
                poller.stop();

                return undefined;
            } catch (error) {
                return retryDelayOf(asApiError(error));
            }
        }, CONNECTIONS_POLL_MS);

        poller.start();
        onScopeDispose(() => poller.stop());
    };

    readOnce<UiPageWire>('/ui-pages', (items) => {
        registered.value = items;
    });
    readOnce<ConnectionTypeWire>('/connection-types', (items) => {
        types.value = items;
        typesLoaded.value = true;
    });

    return {
        pages: useResolved(
            () => [registered.value, connections.value, session.principal.value] as const,
            ([pages, list, principal]) => visibleUiPages(pages, list, principal),
            [] as UiPageWire[],
        ),
        types,
        typesLoaded,
        connections,
        loaded,
        refresh,
    };
}
