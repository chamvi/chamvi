<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

defineProps<{ status: string }>();
</script>

<template>
    <span
        :class="['chip', `chip-${status}`]"
        data-testid="status"
    >{{ status }}</span>
</template>
