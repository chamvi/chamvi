<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IconName } from './types.ts';

defineProps<{ name: IconName }>();
</script>

<template>
    <svg
        :viewBox="name === 'hand' || name === 'check' || name === 'cross' || name === 'search' ? '0 0 20 20' : '0 0 16 16'"
        aria-hidden="true"
    >
        <template v-if="name === 'agents'">
            <rect
                x="2.5"
                y="2.5"
                width="4.5"
                height="4.5"
            />
            <rect
                x="9"
                y="2.5"
                width="4.5"
                height="4.5"
            />
            <rect
                x="2.5"
                y="9"
                width="4.5"
                height="4.5"
            />
            <rect
                x="9"
                y="9"
                width="4.5"
                height="4.5"
            />
        </template>
        <path
            v-else-if="name === 'runs'"
            d="M2 4h12M2 8h12M2 12h8"
        />
        <path
            v-else-if="name === 'approvals'"
            d="M3 8.5l3 3 7-7"
        />
        <template v-else-if="name === 'state'">
            <ellipse
                cx="8"
                cy="4"
                rx="5"
                ry="2"
            />
            <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
        </template>
        <template v-else-if="name === 'schedules'">
            <circle
                cx="8"
                cy="8"
                r="6"
            />
            <path d="M8 4.5V8l2.5 1.5" />
        </template>
        <template v-else-if="name === 'sun'">
            <circle
                cx="8"
                cy="8"
                r="3"
            />
            <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
        </template>
        <template v-else-if="name === 'connections'">
            <circle
                cx="4"
                cy="8"
                r="2"
            />
            <circle
                cx="12"
                cy="4"
                r="2"
            />
            <circle
                cx="12"
                cy="12"
                r="2"
            />
            <path d="M5.8 7.1l4.4-2.2M5.8 8.9l4.4 2.2" />
        </template>
        <path
            v-else-if="name === 'moon'"
            d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"
        />
        <path
            v-else-if="name === 'logout'"
            d="M6 2.5H3.5v11H6M10 5l3 3-3 3M13 8H6"
        />
        <path
            v-else-if="name === 'go'"
            d="M6 3.5L10.5 8 6 12.5"
        />
        <path
            v-else-if="name === 'back'"
            d="M10 3.5L5.5 8 10 12.5"
        />
        <path
            v-else-if="name === 'play'"
            d="M5 3.5v9l7-4.5z"
        />
        <template v-else-if="name === 'lock'">
            <rect
                x="3"
                y="7"
                width="10"
                height="7"
                rx="1"
            />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </template>
        <template v-else-if="name === 'hand'">
            <rect
                x="5"
                y="4"
                width="3"
                height="12"
                rx="1"
            />
            <rect
                x="12"
                y="4"
                width="3"
                height="12"
                rx="1"
            />
        </template>
        <path
            v-else-if="name === 'check'"
            d="M4.5 10.5l3.5 3.5 7.5-8"
        />
        <path
            v-else-if="name === 'cross'"
            d="M5.5 5.5l9 9M14.5 5.5l-9 9"
        />
        <template v-else>
            <circle
                cx="9"
                cy="9"
                r="5.5"
            />
            <path d="M13 13l4 4" />
        </template>
    </svg>
</template>
