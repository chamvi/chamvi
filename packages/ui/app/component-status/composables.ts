/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { onScopeDispose, shallowRef } from 'vue';
import type { PollerTimers } from '@chamvi/ui-kit';
import type { ApiError, ComponentWire, IClient } from '@chamvi/http-kit';
import { createPoller } from '@chamvi/ui-kit';
import { asApiError, retryDelayOf } from '@chamvi/http-kit';
import { COMPONENTS_POLL_MS } from './constants.ts';

/** `GET /components`, refreshed every `COMPONENTS_POLL_MS` while the scope lives. */
export function useComponents(client: IClient, timers?: PollerTimers) {
    const components = shallowRef<ComponentWire[]>([]);
    const error = shallowRef<ApiError>();
    const loaded = shallowRef(false);
    const poller = createPoller(async () => {
        try {
            components.value = await client.component.getMany();
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
