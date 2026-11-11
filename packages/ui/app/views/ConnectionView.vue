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
} from '@chamvi/ui-kit';
import { RouteName } from '../router/constants.ts';

const { client, session } = useAppContext();
const api = createConnectionsApi(client);
const route = useRoute();
const name = computed(() => String(route.params.name));
const write = computed(() => canWriteConnection(session.principal.value?.permissions ?? [], name.value));
</script>

<template>
    <RouterLink
        class="back"
        :to="{ name: RouteName.CONNECTIONS }"
    >
        <NavIcon name="back" />connections / {{ name }}
    </RouterLink>

    <ConnectionPanel
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
