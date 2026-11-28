<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';

const props = defineProps<{
    label: string;
    value: string;
    ratio?: number
}>();
const width = computed(() => `${Math.round(Math.min(1, Math.max(0, props.ratio ?? 0)) * 100)}%`);
</script>

<template>
    <div
        class="meter"
        data-testid="usage-meter"
    >
        <div class="meter-top">
            <span class="muted">{{ label }}</span>
            <span>{{ value }}</span>
        </div>
        <div class="bar u-accent">
            <i :style="{ width }" />
        </div>
    </div>
</template>
