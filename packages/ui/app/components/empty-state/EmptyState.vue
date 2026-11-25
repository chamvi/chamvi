<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { NavIcon } from '@chamvi/ui-kit';
import type { IconName } from '@chamvi/ui-kit';
import type { EmptyStateVariant } from '@vuecs/elements';

// VCEmptyState with the dashboard's glyphs: `noResults` (filters matched nothing)
// renders its own button from `actionLabel` and emits `action`; the default slot
// replaces that button (a link, a primary action)
defineProps<{
    icon: IconName;
    title: string;
    text?: string;
    variant?: EmptyStateVariant;
    actionLabel?: string;
}>();

const emit = defineEmits<{ action: [] }>();
</script>

<template>
    <VCEmptyState
        :variant="variant"
        :title="title"
        :description="text"
        :action-label="actionLabel"
        data-testid="empty"
        @action="emit('action')"
    >
        <template #icon>
            <NavIcon :name="icon" />
        </template>
        <template
            v-if="$slots.default"
            #action
        >
            <slot />
        </template>
    </VCEmptyState>
</template>
