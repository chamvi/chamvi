<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionState, ConnectionStatus } from '@chamvi/core';
import { computed } from 'vue';
import { connectionBadge } from './helpers.ts';

const props = defineProps<{
    status: ConnectionStatus;
    /** What the configuration lacks wins over the live status. */
    state?: ConnectionState;
    /** `false`: nothing runs in this process, so `status` says nothing. */
    live?: boolean;
}>();
const badge = computed(() => connectionBadge(props));
</script>

<template>
    <span
        :class="['chip', `chip-${badge.tone}`]"
        data-testid="connection-status"
        :data-status="status"
    >{{ badge.label }}</span>
</template>
