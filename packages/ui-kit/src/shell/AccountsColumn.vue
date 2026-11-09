<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import type { MeWire } from '../api/types.ts';
import { hasPermission } from '../auth/helpers.ts';
import { CONNECTIONS_CREATE_PERMISSION } from '../connections/constants.ts';
import { statusBadge } from '../connections/helpers.ts';
import type { ConnectionTypeWire, ConnectionWire } from '../connections/types.ts';

const props = defineProps<{
    type: ConnectionTypeWire;
    connections: readonly ConnectionWire[];
    principal?: MeWire;
    /** The name of the open connection. */
    current?: string;
}>();

const emit = defineEmits<{ select: [name: string]; add: [] }>();

const accounts = computed(() => props.connections
    .filter((connection) => connection.type === props.type.type)
    .map((connection) => ({
        name: connection.name,
        label: connection.account ?? connection.name,
        badge: statusBadge(connection.status),
    })));

// `creatable` is false when this app cannot store accounts of the type: Add would only be refused
const canAdd = computed(() => props.type.multiple &&
    props.type.creatable &&
    hasPermission(props.principal?.permissions ?? [], CONNECTIONS_CREATE_PERMISSION));
</script>

<template>
    <nav
        class="accounts"
        aria-label="Accounts"
    >
        <div class="nav-group">
            Accounts
        </div>
        <button
            v-for="account in accounts"
            :key="account.name"
            type="button"
            class="nav-item"
            :data-account="account.name"
            :aria-current="current === account.name ? 'page' : undefined"
            @click="emit('select', account.name)"
        >
            <span
                :class="['dot', `dot-${account.badge.tone}`]"
                :title="account.badge.label"
                role="img"
                :aria-label="account.badge.label"
            />
            {{ account.label }}
        </button>
        <p
            v-if="accounts.length === 0"
            class="accounts-empty"
        >
            No accounts yet.
        </p>
        <button
            v-if="canAdd"
            type="button"
            class="nav-item account-add"
            @click="emit('add')"
        >
            + Add account
        </button>
    </nav>
</template>
