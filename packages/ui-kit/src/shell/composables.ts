/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed, onScopeDispose, shallowRef } from 'vue';
import { asApiError, retryDelayOf } from '@chamvi/http-kit';
import type { ConnectionTypeWire, UiPageWire } from '@chamvi/http-kit';
import { useConnections } from '../connections/composables.ts';
import { CONNECTIONS_POLL_MS } from '../connections/constants.ts';
import { useAppContext } from '../context/module.ts';
import { createPoller } from '../polling/module.ts';
import { visibleUiPages } from './helpers.ts';

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
    } = useConnections(client.connection);
    const registered = shallowRef<UiPageWire[]>([]);
    const types = shallowRef<ConnectionTypeWire[]>([]);
    const typesLoaded = shallowRef(false);

    // one poller per list: a failing or stalled page list never holds back the types an add form waits for
    const readOnce = <T>(read: () => Promise<T[]>, apply: (items: T[]) => void) => {
        const poller = createPoller(async () => {
            try {
                apply(await read());
                poller.stop();

                return undefined;
            } catch (error) {
                return retryDelayOf(asApiError(error));
            }
        }, CONNECTIONS_POLL_MS);

        poller.start();
        onScopeDispose(() => poller.stop());
    };

    readOnce<UiPageWire>(() => client.uiPage.getMany(), (items) => {
        registered.value = items;
    });
    readOnce<ConnectionTypeWire>(() => client.connectionType.getMany(), (items) => {
        types.value = items;
        typesLoaded.value = true;
    });

    return {
        pages: computed(() => visibleUiPages(registered.value, connections.value, (name) => session.allowed(name))),
        types,
        typesLoaded,
        connections,
        loaded,
        refresh,
    };
}
