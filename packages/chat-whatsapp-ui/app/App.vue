<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed, shallowRef } from 'vue';
import {
    AccountsColumn,
    AppShell,
    ConnectionPanel,
    createConnectionsApi,
    useAppContext,
    useUiPages,
} from '@chamvi/ui-kit';
import { CONNECTION_WRITE, WHATSAPP_TYPE } from './constants.ts';
import QrWidget from './QrWidget.vue';

const { client, session } = useAppContext();
const { connections, loaded } = useUiPages();
const api = createConnectionsApi(client);

const chosen = shallowRef(new URLSearchParams(globalThis.location.search).get('connection') ?? undefined);
const sessions = computed(() => connections.value.filter((connection) => connection.type === WHATSAPP_TYPE.type));
// a query naming another type's connection, or one that is gone, falls back to the first session
const current = computed(() => {
    const listed = sessions.value.some((entry) => entry.name === chosen.value);

    return listed ? chosen.value : sessions.value[0]?.name;
});
// the QR stream and reset follow the session's verdict (an upper bound: a refused reset shows its 403 inline)
const write = computed(() => (current.value === undefined ? undefined : session.allowed(CONNECTION_WRITE)));

/** The open session lives in the query, so a reload comes back to it. */
function open(name: string): void {
    chosen.value = name;

    const url = new URL(globalThis.location.href);

    url.searchParams.set('connection', name);
    globalThis.history.replaceState(globalThis.history.state, '', url);
}
</script>

<template>
    <AppShell
        :principal="session.principal.value"
        current="chat-whatsapp"
    >
        <template #accounts>
            <AccountsColumn
                :type="WHATSAPP_TYPE"
                :connections="connections"
                :current="current"
                @select="open($event)"
            />
        </template>

        <ConnectionPanel
            v-if="current && write !== undefined"
            :key="`${current}:${write}`"
            :api="api"
            :name="current"
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
        <div
            v-else-if="loaded && !current"
            class="card notice"
            data-testid="connections-empty"
        >
            No WhatsApp session in this app.
        </div>
    </AppShell>
</template>
