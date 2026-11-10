<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed } from 'vue';
import { qrDataUrl } from '@chamvi/ui-kit';

// pairing material: rendered here only, never shown as text or logged
const props = defineProps<{ value: string }>();
const src = computed(() => qrDataUrl(props.value));
</script>

<template>
    <figure class="qr-widget">
        <img
            :src="src"
            alt="Pairing QR code"
            width="264"
            height="264"
            data-testid="connection-qr"
        >
        <figcaption>Scan with the app to link this connection. The code changes while it waits.</figcaption>
    </figure>
</template>
