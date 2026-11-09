<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed, provide } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { AppShell, useAppContext } from '@chamvi/ui-kit';
import type { MeWire } from '@chamvi/ui-kit';
import { useApprovals } from '../../approvals/composables.ts';
import { INBOX } from '../../approvals/constants.ts';
import { RouteName } from '../../router/constants.ts';

defineProps<{ principal?: MeWire }>();

const emit = defineEmits<{ signOut: [] }>();

// one inbox for the badge and the approvals view
const { client } = useAppContext();
const inbox = useApprovals(client);

provide(INBOX, inbox);

const route = useRoute();
const router = useRouter();

// a detail route lights its section
const DETAIL_SECTIONS: Record<string, string> = {
    [RouteName.AGENT]: RouteName.AGENTS,
    [RouteName.RUN]: RouteName.RUNS,
    [RouteName.CONNECTION]: RouteName.CONNECTIONS,
};

const current = computed(() => {
    const name = String(route.name);

    return DETAIL_SECTIONS[name] ?? name;
});
const badges = computed(() => ({ approvals: inbox.runs.value.length }));

function navigate(path: string): void {
    void router.push(path);
}
</script>

<template>
    <AppShell
        :principal="principal"
        :current="current"
        :navigate="navigate"
        :badges="badges"
        @sign-out="emit('signOut')"
    >
        <slot />
    </AppShell>
</template>
