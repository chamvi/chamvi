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
import { ARTIFACT_READS_MAX } from './constants.ts';
import type { ArtifactTile, ArtifactTilesOptions } from './types.ts';

/**
 * The artifacts of a wait point as tiles: the run's metadata read once per
 * key (`listArtifacts`), the bytes of inline raster images read through the
 * bearer client and shown as object URLs. URLs are revoked on a key change
 * and when the scope stops; a read that lands after the key changed is
 * dropped before any URL is made, and the reads of a replaced load are
 * aborted. At most `ARTIFACT_READS_MAX` reads run at once per card. A load
 * that failed (metadata or a read) runs again when `refresh()` changes (the
 * next poll), so a transient 429 or 503 does not leave tiles missing. `start()` begins (a component calls it
 * when mounted, so server rendering fetches nothing).
 */
export function useArtifactTiles(options: ArtifactTilesOptions) {
    const urls = options.urls ?? browserObjectUrls;
    const save = options.save ?? saveBlob;
    const tiles = shallowRef<Record<string, ArtifactTile>>({});
    const owned = new Set<string>();
    let generation = 0;
    let started = false;
    let failed = false;
    let controller: AbortController | undefined;

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

        controller?.abort();
        controller = new AbortController();

        const { signal } = controller;

        failed = false;
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
            failed = current === generation;

            for (const id of ids) {
                set(current, {
                    id,
                    name: id,
                    status: 'missing',
                });
            }

            return;
        }

        const reads: Array<() => Promise<void>> = [];

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
            reads.push(async () => {
                if (current !== generation) {
                    return;
                }

                let blob: Blob;

                try {
                    blob = await options.client.readArtifact(runId, id, signal);
                } catch {
                    if (current === generation) {
                        failed = true;
                    }

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
            });
        }

        // a few reads at a time per card: many images never burst past the rate limit at once
        const next = async (): Promise<void> => {
            for (let read = reads.shift(); read; read = reads.shift()) {
                await read();
            }
        };

        await Promise.all(Array.from({ length: Math.min(ARTIFACT_READS_MAX, reads.length) }, next));
    };

    function start(): void {
        if (started) {
            return;
        }

        started = true;
        // two sources, compared one by one: a getter returning a new array would fire on every poll that replaces the run
        watch([options.runId, options.key], ([runId]) => load(runId), { immediate: true });

        if (options.refresh) {
            // a failed load is retried on the next poll, never on a healthy one
            watch(options.refresh, () => {
                if (failed) {
                    void load(options.runId());
                }
            });
        }
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
        controller?.abort();
        revokeAll();
    });

    return {
        tiles,
        start,
        tilesOf,
        download,
    };
}
