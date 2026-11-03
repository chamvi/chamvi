<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { ArtifactTile } from '../../artifacts/types.ts';

defineProps<{ tiles: ArtifactTile[] }>();

const emit = defineEmits<{
    /** An inline image was clicked: show it full size. */
    open: [tile: ArtifactTile];
    /** A non-inline artifact was clicked: save it as a file. */
    download: [id: string];
}>();
</script>

<template>
    <div
        v-if="tiles.length > 0"
        class="artifact-strip"
        data-testid="artifact-strip"
    >
        <figure
            v-for="tile in tiles"
            :key="tile.id"
            class="artifact"
            data-testid="artifact"
            :data-artifact="tile.id"
            :data-status="tile.status"
        >
            <button
                v-if="tile.status === 'image'"
                type="button"
                class="artifact-thumb"
                data-testid="artifact-open"
                @click="emit('open', tile)"
            >
                <img
                    :src="tile.url"
                    :alt="tile.name"
                    loading="lazy"
                >
            </button>
            <button
                v-else-if="tile.status === 'file'"
                type="button"
                class="artifact-thumb artifact-file"
                data-testid="artifact-download"
                :title="tile.mediaType"
                :aria-label="`Download ${tile.name}`"
                @click="emit('download', tile.id)"
            >
                Download
            </button>
            <div
                v-else
                class="artifact-thumb artifact-placeholder"
            >
                {{ tile.status === 'missing' ? 'Not available' : 'Loading' }}
            </div>
            <figcaption class="artifact-name mono">
                {{ tile.name }}
            </figcaption>
        </figure>
    </div>
</template>
