<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ConnectionStatus } from '@chamvi/core';
import { computed } from 'vue';
import { statusBadge } from './helpers.ts';

const props = defineProps<{ status: ConnectionStatus }>();
const badge = computed(() => statusBadge(props.status));
</script>

<template>
    <span
        :class="['chip', `chip-${badge.tone}`]"
        data-testid="connection-status"
        :data-status="status"
    >{{ badge.label }}</span>
</template>
