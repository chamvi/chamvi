/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { effectScope, ref } from 'vue';
import type { ArtifactWire } from '../../../../app/api/types.ts';
import { useArtifactTiles } from '../../../../app/artifacts/composables.ts';
import type { ObjectUrls } from '../../../../app/artifacts/types.ts';
import { apiError, fakeClient } from '../../../utils/client.ts';
import { flush } from '../../../utils/timers.ts';

function meta(id: string, mediaType: string, filename?: string): ArtifactWire {
    return {
        id,
        runId: 'r1',
        agent: 'deploy',
        mediaType,
        ...(filename ? { filename } : {}),
        size: 1,
        createdAt: '2026-11-02T10:00:00.000Z',
    };
}

function fakeUrls() {
    let next = 0;
    const live = new Set<string>();
    const revoked: string[] = [];
    const urls: ObjectUrls = {
        create: () => {
            const url = `blob:test/${++next}`;

            live.add(url);

            return url;
        },
        revoke: (url) => {
            live.delete(url);
            revoked.push(url);
        },
    };

    return {
        urls,
        live,
        revoked,
    };
}

const METADATA = [
    meta('a', 'image/png', 'button-actual.png'),
    meta('b', 'image/svg+xml', 'logo.svg'),
    meta('c', 'application/pdf'),
    meta('d', 'image/webp', 'gone.webp'),
];

function setup(options: { ids?: string[]; reads?: Record<string, () => Promise<Blob>> } = {}) {
    const reads: string[] = [];
    const lists: string[] = [];
    const saved: Array<[string, string]> = [];
    const client = fakeClient({
        listArtifacts: async (runId) => {
            lists.push(runId);

            return METADATA;
        },
        readArtifact: async (runId, id) => {
            reads.push(`${runId}/${id}`);

            const read = options.reads?.[id];

            if (read) {
                return read();
            }

            if (id === 'd') {
                throw apiError(404, 'artifact_not_found');
            }

            return new Blob([id]);
        },
    });
    const {
        urls, 
        live, 
        revoked, 
    } = fakeUrls();
    const key = ref<string | undefined>('call-1:0');
    const ids = ref(options.ids ?? ['a', 'b', 'c', 'd', 'e']);
    const scope = effectScope();
    const tiles = scope.run(() => useArtifactTiles({
        client,
        runId: () => 'r1',
        key: () => key.value,
        ids: () => ids.value,
        urls,
        save: async (blob, name) => {
            saved.push([await blob.text(), name]);
        },
    }))!;

    return {
        tiles,
        scope,
        key,
        ids,
        reads,
        lists,
        saved,
        live,
        revoked,
    };
}

describe('useArtifactTiles', () => {
    it('loads nothing before start', async () => {
        const { tiles, lists } = setup();

        await flush();
        expect(lists).toEqual([]);
        expect(tiles.tilesOf(['a']).map((tile) => tile.status)).toEqual(['loading']);
    });

    it('reads the metadata once and the bytes of inline images only', async () => {
        const {
            tiles,
            lists,
            reads,
            live,
        } = setup();

        tiles.start();
        await flush();

        expect(lists).toEqual(['r1']);
        expect(reads.sort()).toEqual(['r1/a', 'r1/d']);
        expect(tiles.tilesOf(['a', 'b', 'c', 'd', 'e'])).toEqual([
            {
                id: 'a',
                name: 'button-actual.png',
                mediaType: 'image/png',
                status: 'image',
                url: 'blob:test/1',
            },
            {
                id: 'b',
                name: 'logo.svg',
                mediaType: 'image/svg+xml',
                status: 'file',
            },
            {
                id: 'c',
                name: 'c',
                mediaType: 'application/pdf',
                status: 'file',
            },
            // the bytes 404: a placeholder with the filename
            {
                id: 'd',
                name: 'gone.webp',
                mediaType: 'image/webp',
                status: 'missing',
            },
            // not in the run's artifacts
            {
                id: 'e',
                name: 'e',
                status: 'missing',
            },
        ]);
        expect([...live]).toEqual(['blob:test/1']);
    });

    it('marks every tile missing when the metadata cannot be read', async () => {
        const scope = effectScope();
        const tiles = scope.run(() => useArtifactTiles({
            client: fakeClient({
                listArtifacts: async () => {
                    throw apiError(403, 'forbidden');
                },
            }),
            runId: () => 'r1',
            key: () => 'k',
            ids: () => ['a'],
            urls: fakeUrls().urls,
        }))!;

        tiles.start();
        await flush();
        expect(tiles.tilesOf(['a'])).toEqual([{
            id: 'a',
            name: 'a',
            status: 'missing',
        }]);
        scope.stop();
    });

    it('loads again on the next refresh after the metadata read failed, not after a healthy load', async () => {
        let fail = true;
        let lists = 0;
        const refresh = ref(0);
        const scope = effectScope();
        const tiles = scope.run(() => useArtifactTiles({
            client: fakeClient({
                listArtifacts: async () => {
                    lists++;

                    if (fail) {
                        throw apiError(503, 'unavailable');
                    }

                    return METADATA;
                },
                readArtifact: async (_runId, id) => new Blob([id]),
            }),
            runId: () => 'r1',
            key: () => 'k',
            refresh: () => refresh.value,
            ids: () => ['a'],
            urls: fakeUrls().urls,
        }))!;

        tiles.start();
        await flush();
        expect(tiles.tilesOf(['a'])[0]?.status).toBe('missing');

        fail = false;
        refresh.value++;
        await flush();
        expect(tiles.tilesOf(['a'])[0]?.status).toBe('image');
        expect(lists).toBe(2);

        refresh.value++;
        await flush();
        expect(lists).toBe(2);
        scope.stop();
    });

    it('loads again on the next refresh after an image read failed', async () => {
        let fail = true;
        const refresh = ref(0);
        const scope = effectScope();
        const tiles = scope.run(() => useArtifactTiles({
            client: fakeClient({
                listArtifacts: async () => METADATA,
                readArtifact: async (_runId, id) => {
                    if (fail) {
                        throw apiError(429, 'too_many_requests');
                    }

                    return new Blob([id]);
                },
            }),
            runId: () => 'r1',
            key: () => 'k',
            refresh: () => refresh.value,
            ids: () => ['a'],
            urls: fakeUrls().urls,
        }))!;

        tiles.start();
        await flush();
        expect(tiles.tilesOf(['a'])[0]?.status).toBe('missing');

        fail = false;
        refresh.value++;
        await flush();
        expect(tiles.tilesOf(['a'])[0]?.status).toBe('image');
        scope.stop();
    });

    it('runs at most four image reads at once and aborts them when the scope stops', async () => {
        const ids = Array.from({ length: 10 }, (_, i) => `img${i}`);
        const signals: AbortSignal[] = [];
        let running = 0;
        let peak = 0;
        const scope = effectScope();
        const tiles = scope.run(() => useArtifactTiles({
            client: fakeClient({
                listArtifacts: async () => ids.map((id) => meta(id, 'image/png')),
                readArtifact: (_runId, _id, signal) => {
                    running++;
                    peak = Math.max(peak, running);
                    signals.push(signal!);

                    return new Promise<Blob>(() => {});
                },
            }),
            runId: () => 'r1',
            key: () => 'k',
            ids: () => ids,
            urls: fakeUrls().urls,
        }))!;

        tiles.start();
        await flush();
        expect(peak).toBe(4);
        expect(signals.every((signal) => !signal.aborted)).toBe(true);

        scope.stop();
        expect(signals.every((signal) => signal.aborted)).toBe(true);
    });

    it('revokes object URLs when the scope stops', async () => {
        const {
            tiles,
            scope,
            live,
            revoked,
        } = setup();

        tiles.start();
        await flush();
        scope.stop();

        expect(live.size).toBe(0);
        expect(revoked).toEqual(['blob:test/1']);
    });

    it('clears images when the key (the approval id) changes and loads again', async () => {
        const {
            tiles,
            key,
            ids,
            lists,
            live,
            revoked,
        } = setup();

        tiles.start();
        await flush();
        ids.value = ['a'];
        key.value = 'call-2:0';
        await Promise.resolve();
        // the old URL is gone before the new wait point's images arrive
        expect(revoked).toEqual(['blob:test/1']);
        await flush();

        expect(lists).toEqual(['r1', 'r1']);
        expect(tiles.tilesOf(['a'])[0]).toMatchObject({ status: 'image', url: 'blob:test/2' });
        expect([...live]).toEqual(['blob:test/2']);
    });

    it('keeps the tiles when the run object is replaced with the same run and approval id', async () => {
        const reads: string[] = [];
        const lists: string[] = [];
        const {
            urls,
            live,
            revoked,
        } = fakeUrls();
        // a poll replaces the run with a new object holding the same ids
        const run = ref({ id: 'r1', waiting: { approvalId: 'call-1:0' } });
        const scope = effectScope();
        const tiles = scope.run(() => useArtifactTiles({
            client: fakeClient({
                listArtifacts: async (runId) => {
                    lists.push(runId);

                    return METADATA;
                },
                readArtifact: async (runId, id) => {
                    reads.push(`${runId}/${id}`);

                    return new Blob([id]);
                },
            }),
            runId: () => run.value.id,
            key: () => run.value.waiting.approvalId,
            ids: () => ['a'],
            urls,
        }))!;

        tiles.start();
        await flush();
        run.value = { id: 'r1', waiting: { approvalId: 'call-1:0' } };
        await flush();
        run.value = { id: 'r1', waiting: { approvalId: 'call-1:0' } };
        await flush();

        expect(lists).toEqual(['r1']);
        expect(reads).toEqual(['r1/a']);
        expect(revoked).toEqual([]);
        expect([...live]).toEqual(['blob:test/1']);
        expect(tiles.tilesOf(['a'])[0]).toMatchObject({ status: 'image', url: 'blob:test/1' });
        scope.stop();
    });

    it('drops a stale image that arrives after the key changed, without creating a URL', async () => {
        const slow = Promise.withResolvers<Blob>();
        const {
            tiles,
            key,
            ids,
            live,
        } = setup({
            ids: ['a'],
            reads: { a: () => slow.promise },
        });

        tiles.start();
        await flush();
        ids.value = [];
        key.value = 'call-2:0';
        await flush();
        slow.resolve(new Blob(['late']));
        await flush();

        expect(live.size).toBe(0);
        expect(tiles.tilesOf(['a'])[0]?.status).toBe('loading');
    });

    it('downloads a non-inline artifact through save with its filename', async () => {
        const { tiles, saved } = setup();

        tiles.start();
        await flush();
        await tiles.download('b');

        expect(saved).toEqual([['b', 'logo.svg']]);
    });

    it('marks a download that fails as missing', async () => {
        const { tiles, saved } = setup({ reads: { c: () => Promise.reject(apiError(404, 'artifact_not_found')) } });

        tiles.start();
        await flush();
        await tiles.download('c');

        expect(saved).toEqual([]);
        expect(tiles.tilesOf(['c'])[0]?.status).toBe('missing');
    });
});
