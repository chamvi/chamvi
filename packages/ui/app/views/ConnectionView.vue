<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import QrWidget from '../connections/QrWidget.vue';
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
        <template #widgets="{ widgets }">
            <section
                v-for="(widget, index) in widgets"
                :key="`${widget.kind}:${index}`"
                class="card connection-widget"
            >
                <QrWidget
                    v-if="widget.kind === 'qr'"
                    :value="widget.value"
                />
            </section>
        </template>
    </ConnectionPanel>
</template>
