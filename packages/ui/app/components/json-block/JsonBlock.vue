<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import { toJson } from '../../runs/helpers/index.ts';
import { tokenizeJson } from './helpers.ts';

const props = defineProps<{ value: unknown }>();
const tokens = computed(() => tokenizeJson(toJson(props.value)));
</script>

<template>
    <pre class="code"><span
        v-for="(token, i) in tokens"
        :key="i"
        :class="token.kind"
    >{{ token.text }}</span></pre>
</template>
