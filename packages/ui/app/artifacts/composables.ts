/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { onScopeDispose, shallowRef, watch } from 'vue';
import {
    browserObjectUrls,
    isInlineImage,
    saveBlob,
} from './helpers.ts';
import type { ArtifactTile, ArtifactTilesOptions } from './types.ts';

/**
 * The artifacts of a wait point as tiles: the run's metadata read once per
 * key (`listArtifacts`), the bytes of inline raster images read through the
 * bearer client and shown as object URLs. URLs are revoked on a key change
 * and when the scope stops; a read that lands after the key changed is
 * dropped before any URL is made. `start()` begins (a component calls it
 * when mounted, so server rendering fetches nothing).
 */
export function useArtifactTiles(options: ArtifactTilesOptions) {
    const urls = options.urls ?? browserObjectUrls;
    const save = options.save ?? saveBlob;
    const tiles = shallowRef<Record<string, ArtifactTile>>({});
    const owned = new Set<string>();
    let generation = 0;
    let started = false;

    const revokeAll = () => {
        for (const url of owned) {
            urls.revoke(url);
        }

        owned.clear();
    };

    const set = (current: number, tile: ArtifactTile) => {
        if (current === generation) {
            tiles.value = { ...tiles.value, [tile.id]: tile };
        }
    };

    const load = async (runId: string | undefined): Promise<void> => {
        const current = ++generation;

        revokeAll();

        const ids = [...new Set(options.ids())];

        tiles.value = Object.fromEntries(ids.map((id) => [id, {
            id,
            name: id,
            status: 'loading',
        } satisfies ArtifactTile]));

        if (!runId || ids.length === 0) {
            return;
        }

        let metadata: Map<string, { mediaType: string; filename?: string }>;

        try {
            metadata = new Map((await options.client.listArtifacts(runId)).map((item) => [item.id, item]));
        } catch {
            for (const id of ids) {
                set(current, {
                    id,
                    name: id,
                    status: 'missing',
                });
            }

            return;
        }

        const reads: Array<Promise<void>> = [];

        for (const id of ids) {
            const item = metadata.get(id);

            if (!item) {
                set(current, {
                    id,
                    name: id,
                    status: 'missing',
                });

                continue;
            }

            const base = {
                id,
                name: item.filename ?? id,
                mediaType: item.mediaType,
            };

            if (!isInlineImage(item.mediaType)) {
                set(current, { ...base, status: 'file' });

                continue;
            }

            set(current, { ...base, status: 'loading' });
            reads.push((async () => {
                let blob: Blob;

                try {
                    blob = await options.client.readArtifact(runId, id);
                } catch {
                    set(current, { ...base, status: 'missing' });

                    return;
                }

                if (current !== generation) {
                    return;
                }

                const url = urls.create(blob);

                owned.add(url);
                set(current, {
                    ...base,
                    status: 'image',
                    url,
                });
            })());
        }

        await Promise.all(reads);
    };

    function start(): void {
        if (started) {
            return;
        }

        started = true;
        watch(() => [options.runId(), options.key()] as const, ([runId]) => load(runId), { immediate: true });
    }

    function tilesOf(ids: readonly string[] | undefined): ArtifactTile[] {
        return (ids ?? []).map((id) => tiles.value[id] ?? {
            id,
            name: id,
            status: 'loading',
        });
    }

    /** Reads a `file` tile's bytes and saves them under its name. */
    async function download(id: string): Promise<void> {
        const runId = options.runId();
        const tile = tiles.value[id];

        if (!runId || !tile) {
            return;
        }

        const current = generation;

        try {
            await save(await options.client.readArtifact(runId, id), tile.name);
        } catch {
            set(current, { ...tile, status: 'missing' });
        }
    }

    onScopeDispose(() => {
        generation++;
        revokeAll();
    });

    return {
        tiles,
        start,
        tilesOf,
        download,
    };
}
