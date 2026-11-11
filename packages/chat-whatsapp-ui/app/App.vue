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
    canWriteConnection,
    createConnectionsApi,
    useAppContext,
    useResolved,
    useUiPages,
} from '@chamvi/ui-kit';
import type { MeWire } from '@chamvi/ui-kit';
import { WHATSAPP_TYPE } from './constants.ts';
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
const verdict = useResolved<readonly [string | undefined, MeWire | undefined], { name: string; write: boolean } | undefined>(
    () => [current.value, session.principal.value] as const,
    async ([name, principal]) => (name === undefined ?
        undefined :
        { name, write: await canWriteConnection(principal, { name, type: WHATSAPP_TYPE.type }) }),
    undefined,
);
// the panel waits for the verdict of the open session: it decides once whether to follow the stream (and the QR)
const write = computed(() => (verdict.value && verdict.value.name === current.value ? verdict.value.write : undefined));

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
                :principal="session.principal.value"
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
