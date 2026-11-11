<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
    ConnectionPanel,
    NavIcon,
    canWriteConnection,
    createConnectionsApi,
    useAppContext,
    useResolved,
} from '@chamvi/ui-kit';
import type { MeWire } from '@chamvi/ui-kit';
import { RouteName } from '../router/constants.ts';

const { client, session } = useAppContext();
const api = createConnectionsApi(client);
const route = useRoute();
const name = computed(() => String(route.params.name));
// the server checks a connection by name and type: the type comes from the list (absent for one it does not hold)
const verdict = useResolved<readonly [string, MeWire | undefined], { name: string; write: boolean } | undefined>(
    () => [name.value, session.principal.value] as const,
    async ([current, principal]) => {
        let type: string | undefined;

        try {
            type = (await api.list()).find((connection) => connection.name === current)?.type;
        } catch {
            type = undefined;
        }

        return { name: current, write: await canWriteConnection(principal, { name: current, type }) };
    },
    undefined,
);
// the panel waits for the verdict of this name: it decides once whether to follow the stream
const write = computed(() => (verdict.value?.name === name.value ? verdict.value.write : undefined));
</script>

<template>
    <RouterLink
        class="back"
        :to="{ name: RouteName.CONNECTIONS }"
    >
        <NavIcon name="back" />connections / {{ name }}
    </RouterLink>

    <ConnectionPanel
        v-if="write !== undefined"
        :key="`${name}:${write}`"
        :api="api"
        :name="name"
        :write="write"
    >
        <!-- pairing material renders on the provider's page, never here: the dashboard names no provider -->
        <template #widgets="{ widgets }">
            <div
                v-if="widgets.some((widget) => widget.kind === 'qr')"
                class="card notice"
                data-testid="connection-pairing"
            >
                This connection waits to be paired. Its QR shows on its page in the sidebar.
                No page there? Add the dashboard module of its type's <b class="mono">-ui</b> package to the app.
            </div>
        </template>
    </ConnectionPanel>
</template>
