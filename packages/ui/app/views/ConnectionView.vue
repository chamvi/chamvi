<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import NavIcon from '../components/nav-icon/NavIcon.vue';
import { createConnectionsApi } from '../connections/api.ts';
import ConnectionPanel from '../connections/ConnectionPanel.vue';
import { canWriteConnection } from '../connections/helpers.ts';
import { useAppContext } from '../context/module.ts';
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
    />
</template>
