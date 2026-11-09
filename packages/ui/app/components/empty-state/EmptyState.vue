<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { NavIcon } from '@chamvi/ui-kit';
import type { IconName } from '@chamvi/ui-kit';

defineProps<{
    icon: IconName;
    title: string;
    text?: string
}>();
</script>

<template>
    <div
        class="empty"
        data-testid="empty"
    >
        <span class="empty-icon"><NavIcon :name="icon" /></span>
        <b>{{ title }}</b>
        <p v-if="text || $slots.text">
            <slot name="text">
                {{ text }}
            </slot>
        </p>
        <slot />
    </div>
</template>
