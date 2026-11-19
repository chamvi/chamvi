<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import { activityLabel } from '../../agents/helpers/index.ts';
import type { Activity } from '../../agents/types.ts';

const props = defineProps<{ activity: Activity }>();

const count = computed(() => `${props.activity.count}${props.activity.saturated ? '+' : ''}`);
const hint = computed(() => (props.activity.saturated ? 'Counted from the newest runs read; there may be more.' : undefined));
const label = computed(() => activityLabel(props.activity));
</script>

<template>
    <div class="activity">
        <div class="act-top">
            <span>Activity · 24 h</span>
            <span :title="hint">{{ activity.count ? `${count} runs` : 'none' }}</span>
        </div>
        <div
            class="strip"
            role="img"
            :aria-label="label"
            data-testid="activity"
        >
            <i
                v-for="mark in activity.marks"
                :key="mark.id"
                :class="`m-${mark.status}`"
                :style="{ left: `${mark.left.toFixed(2)}%` }"
            />
            <span
                v-if="activity.marks.length === 0"
                class="strip-none"
            ><span>no runs yet</span></span>
        </div>
        <div
            class="act-axis"
            aria-hidden="true"
        >
            <span>−24 h</span><span>−12 h</span><span>now</span>
        </div>
    </div>
</template>
