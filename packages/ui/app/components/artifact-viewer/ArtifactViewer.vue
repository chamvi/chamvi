<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ArtifactTile } from '../../artifacts/types.ts';

defineProps<{ tile?: ArtifactTile }>();

/** Escape and a click on the backdrop close it (the modal's own handling). */
const open = defineModel<boolean>('open', { required: true });
</script>

<template>
    <VCModal v-model:open="open">
        <VCModalContent
            class="modal card artifact-viewer"
            data-testid="artifact-viewer"
        >
            <VCModalTitle class="mono artifact-viewer-title">
                {{ tile?.name }}
            </VCModalTitle>
            <VCModalDescription>
                Full size. Escape closes.
            </VCModalDescription>
            <img
                v-if="tile?.url"
                :src="tile.url"
                :alt="tile.name"
            >
            <div class="modal-actions">
                <VCButton
                    type="button"
                    class="btn"
                    @click="open = false"
                >
                    Close
                </VCButton>
            </div>
        </VCModalContent>
    </VCModal>
</template>
