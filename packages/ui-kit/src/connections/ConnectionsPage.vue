<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed, shallowRef } from 'vue';
import { hasPermission } from '../auth/helpers.ts';
import { useAppContext } from '../context/module.ts';
import AccountsColumn from '../shell/AccountsColumn.vue';
import AppShell from '../shell/AppShell.vue';
import { useUiPages } from '../shell/composables.ts';
import ConnectionForm from './ConnectionForm.vue';
import type { ConnectionCreated, ConnectionDeleted } from './types.ts';

/** A `*-ui` page's whole content: the shell, its accounts column and the form of the open account. */
const props = defineProps<{
    /** The page's sidebar item. */
    slug: string;
    /** The connection type it configures. */
    type: string;
}>();

const { session } = useAppContext();
const {
    types,
    connections,
    loaded,
    refresh,
} = useUiPages();

const query = new URLSearchParams(globalThis.location.search);
const chosen = shallowRef(query.get('connection') ?? undefined);
const adding = shallowRef(query.has('add'));
const deletedNotice = shallowRef(false);
// an account the principal added but may not read (connections:create alone): confirmed here, never opened
const createdNotice = shallowRef<ConnectionCreated>();

const definition = computed(() => types.value.find((entry) => entry.type === props.type));
const accounts = computed(() => connections.value.filter((connection) => connection.type === props.type));
const current = computed(() => (adding.value ? undefined : chosen.value ?? accounts.value[0]?.name));

/** The open account lives in the query, so a reload (after a restart, say) comes back to it. */
function remember(): void {
    const url = new URL(globalThis.location.href);

    url.searchParams.delete('connection');
    url.searchParams.delete('add');

    if (adding.value) {
        url.searchParams.set('add', '1');
    } else if (chosen.value) {
        url.searchParams.set('connection', chosen.value);
    }

    globalThis.history.replaceState(globalThis.history.state, '', url);
}

function open(name: string | undefined, add = false): void {
    chosen.value = name;
    adding.value = add;
    deletedNotice.value = false;
    createdNotice.value = undefined;
    remember();
}

function onCreated(result: ConnectionCreated): void {
    const permissions = session.principal.value?.permissions ?? [];

    // write implies read; the form of an unreadable account would only show its 403
    if (hasPermission(permissions, `connection:${result.name}:read`) || hasPermission(permissions, `connection:${result.name}:write`)) {
        open(result.name);
    } else {
        open(undefined);
        createdNotice.value = result;
    }

    refresh();
}

function onDeleted(result: ConnectionDeleted): void {
    open(undefined);
    deletedNotice.value = result.restartRequired;
    refresh();
}
</script>

<template>
    <AppShell
        :principal="session.principal.value"
        :current="slug"
    >
        <template #accounts>
            <AccountsColumn
                v-if="definition"
                :type="definition"
                :connections="connections"
                :principal="session.principal.value"
                :current="current"
                @select="open($event)"
                @add="open(undefined, true)"
            />
        </template>

        <div
            v-if="deletedNotice"
            class="banner"
            role="status"
            data-testid="connection-deleted"
        >
            Deleted. Restart the app to apply.
        </div>
        <div
            v-if="createdNotice"
            class="banner"
            role="status"
            data-testid="connection-created"
        >
            Added {{ createdNotice.name }}.
            <template v-if="createdNotice.restartRequired">
                Restart the app to apply.
            </template>
            Opening it needs read access to this connection.
        </div>

        <ConnectionForm
            v-if="adding"
            key="add"
            :type="type"
            @created="onCreated"
        />
        <ConnectionForm
            v-else-if="current"
            :key="current"
            :name="current"
            :type="type"
            @deleted="onDeleted"
        />
        <div
            v-else-if="loaded && !createdNotice"
            class="card notice"
            data-testid="connections-empty"
        >
            No accounts yet.
        </div>
    </AppShell>
</template>
