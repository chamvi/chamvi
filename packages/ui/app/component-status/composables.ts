/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { onScopeDispose, shallowRef } from 'vue';
import type {
    ApiError,
    ComponentWire,
    IApiClient,
    PollerTimers,
} from '@chamvi/ui-kit';
import { asApiError, createPoller, retryDelayOf } from '@chamvi/ui-kit';
import { COMPONENTS_POLL_MS } from './constants.ts';

/** `GET /components`, refreshed every `COMPONENTS_POLL_MS` while the scope lives. */
export function useComponents(client: IApiClient, timers?: PollerTimers) {
    const components = shallowRef<ComponentWire[]>([]);
    const error = shallowRef<ApiError>();
    const loaded = shallowRef(false);
    const poller = createPoller(async () => {
        try {
            components.value = await client.listComponents();
            error.value = undefined;

            return undefined;
        } catch (e) {
            error.value = asApiError(e);

            return retryDelayOf(error.value);
        } finally {
            loaded.value = true;
        }
    }, COMPONENTS_POLL_MS, timers);

    poller.start();
    onScopeDispose(() => poller.stop());

    return {
        components,
        error,
        loaded,
        refresh: () => poller.refresh(),
    };
}
