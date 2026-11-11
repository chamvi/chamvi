<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { RouterLink } from 'vue-router';
import EmptyState from '../components/empty-state/EmptyState.vue';
import {
    NavIcon,
    StatusBadge,
    connectionProblem,
    createConnectionsApi,
    useAppContext,
    useConnections,
} from '@chamvi/ui-kit';
import PageHead from '../components/page-head/PageHead.vue';
import { RouteName } from '../router/constants.ts';

const { client } = useAppContext();
const {
    connections,
    error,
    loaded,
} = useConnections(createConnectionsApi(client));
</script>

<template>
    <PageHead
        title="Connections"
        lede="The accounts this app's channels hold, their status and pairing."
    >
        <span
            v-if="loaded && !error"
            class="live"
        >{{ connections.length }} {{ connections.length === 1 ? 'connection' : 'connections' }}</span>
    </PageHead>

    <div
        v-if="error"
        class="card notice"
    >
        {{ error.code }} · {{ error.message }}
    </div>
    <div
        v-else-if="loaded && connections.length === 0"
        class="card"
    >
        <EmptyState
            icon="connections"
            title="No connections"
            text="No module of this app exposes a connection you may read (connection:<name>:read or :write)."
        />
    </div>
    <div
        v-else-if="connections.length > 0"
        class="card table-card"
    >
        <div class="table-wrap">
            <table
                class="t"
                data-testid="connections"
            >
                <thead>
                    <tr>
                        <th>Connection</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="connection in connections"
                        :key="connection.name"
                        :data-connection="connection.name"
                    >
                        <td>
                            <RouterLink
                                class="id"
                                :to="{ name: RouteName.CONNECTION, params: { name: connection.name } }"
                            >
                                {{ connection.name }}
                            </RouterLink>
                        </td>
                        <td class="mono">
                            {{ connection.type }}
                        </td>
                        <td>
                            <StatusBadge
                                :status="connection.status"
                                :state="connection.state"
                                :live="connection.live"
                            />
                            <p
                                v-if="connectionProblem(connection)"
                                class="hint"
                                data-testid="connection-problem"
                            >
                                {{ connectionProblem(connection) }}
                            </p>
                        </td>
                        <td>
                            <span class="go"><NavIcon name="go" /></span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
