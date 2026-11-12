<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed, shallowRef, watch } from 'vue';
import type { MeWire } from '../api/types.ts';
import { useResolved } from '../auth/composables.ts';
import { useAppContext } from '../context/module.ts';
import AccountsColumn from '../shell/AccountsColumn.vue';
import AppShell from '../shell/AppShell.vue';
import { useUiPages } from '../shell/composables.ts';
import ConnectionForm from './ConnectionForm.vue';
import { canAddAccount, canReadConnection } from './helpers.ts';
import type { ConnectionCreated, ConnectionDeleted, ConnectionTypeWire } from './types.ts';

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
    typesLoaded,
    connections,
    loaded,
    refresh,
} = useUiPages();

const query = new URLSearchParams(globalThis.location.search);
const chosen = shallowRef(query.get('connection') ?? undefined);
const addRequested = shallowRef(query.has('add'));
const deletedNotice = shallowRef(false);
// an account the principal added but may not read (chamvi_connection_create alone): confirmed here, never opened
const createdNotice = shallowRef<ConnectionCreated>();
// deleted here while the list may still hold them; a name leaves once a list arrives without it
const removed = shallowRef<ReadonlySet<string>>(new Set());

const definition = computed(() => types.value.find((entry) => entry.type === props.type));
const listed = computed(() => connections.value.filter((connection) => !removed.value.has(connection.name)));
const accounts = computed(() => listed.value.filter((connection) => connection.type === props.type));

watch(connections, (list) => {
    const names = new Set(list.map((connection) => connection.name));
    const still = [...removed.value].filter((name) => names.has(name));

    if (still.length < removed.value.size) {
        removed.value = new Set(still);
    }
});

function forget(name: string, gone: boolean): void {
    const next = new Set(removed.value);

    if (gone) {
        next.add(name);
    } else {
        next.delete(name);
    }

    removed.value = next;
}

// the query is only a request: honoured once the list and the type can say whether it may be
// `undefined` while the verdict is out: the page then waits instead of opening the first account
const creatable = useResolved<readonly [ConnectionTypeWire | undefined, MeWire | undefined], boolean | undefined>(
    () => [definition.value, session.principal.value] as const,
    ([type, principal]) => (type ? canAddAccount(type, principal) : Promise.resolve(undefined)),
    undefined,
);
const adding = computed(() => addRequested.value && definition.value !== undefined && creatable.value === true);
// a type the app never serves stays absent: only the answer ends the wait
const pending = computed(() => !loaded.value ||
    (addRequested.value && (!typesLoaded.value || (definition.value !== undefined && creatable.value === undefined))));
const current = computed(() => {
    if (pending.value || adding.value) {
        return undefined;
    }

    // another type's connection never opens here; a name not listed yet (just created) does
    const foreign = listed.value.some((connection) => connection.name === chosen.value && connection.type !== props.type);

    return (foreign ? undefined : chosen.value) ?? accounts.value[0]?.name;
});

/** The open account lives in the query, so a reload (after a restart, say) comes back to it. */
function remember(): void {
    const url = new URL(globalThis.location.href);

    url.searchParams.delete('connection');
    url.searchParams.delete('add');

    if (addRequested.value) {
        url.searchParams.set('add', '1');
    } else if (chosen.value) {
        url.searchParams.set('connection', chosen.value);
    }

    globalThis.history.replaceState(globalThis.history.state, '', url);
}

function open(name: string | undefined, add = false): void {
    chosen.value = name;
    addRequested.value = add;
    deletedNotice.value = false;
    createdNotice.value = undefined;
    remember();
}

async function onCreated(result: ConnectionCreated): Promise<void> {
    // the same name created again is a new account
    forget(result.name, false);

    // write implies read; the form of an unreadable account would only show its 403
    if (await canReadConnection(session.principal.value, { name: result.name, type: props.type })) {
        open(result.name);
    } else {
        open(undefined);
        createdNotice.value = result;
    }

    refresh();
}

function onDeleted(result: ConnectionDeleted): void {
    forget(result.name, true);
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
                :connections="listed"
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
            v-else-if="!pending && !createdNotice"
            class="card notice"
            data-testid="connections-empty"
        >
            No accounts yet.
        </div>
    </AppShell>
</template>
