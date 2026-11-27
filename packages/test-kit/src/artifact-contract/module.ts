/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineQuery, eq } from '@rapiq/core';
import {
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { EntityConflictError } from '@chamvi/store';
import type { IArtifactRepository } from '@chamvi/store';
import type { ArtifactRecord } from '@chamvi/core-kit';
import { makeArtifact, testUuid } from '../fixture/helpers.ts';
import type { ArtifactRepositoryContractInput } from './types.ts';

function bytes(...values: number[]): Uint8Array {
    return new Uint8Array(values);
}

async function insert(artifacts: IArtifactRepository, record: ArtifactRecord): Promise<ArtifactRecord> {
    return artifacts.save(artifacts.create(record));
}

async function dataOf(artifacts: IArtifactRepository, id: string): Promise<number[] | null> {
    const data = await artifacts.readData(id);

    return data ? Array.from(data) : null;
}

/** The query the artifact service lists a run's artifacts with: by createdAt, then id. */
function artifactsOf(runId: string) {
    return defineQuery({ filters: eq('runId', runId), sorts: { createdAt: 'ASC', id: 'ASC' } });
}

/**
 * The storage behaviour of an `IArtifactRepository`: metadata stored as
 * given and read without the key and the bytes, the bytes through
 * `readData`, the unique id and `(runId, key)`, changed-column saves,
 * copies and concurrent inserts.
 */
export function describeArtifactRepositoryContract(input: ArtifactRepositoryContractInput): void {
    describe(`artifact repository contract: ${input.name}`, () => {
        let artifacts: IArtifactRepository;

        beforeEach(async () => {
            artifacts = await input.create();
        });

        it('stores the metadata, never reads back the key or the bytes, and resolves from save what the next read returns', async () => {
            const artifact = makeArtifact(testUuid('a1'), { size: 4 });
            const saved = await insert(artifacts, {
                ...artifact,
                key: 'tool:k',
                data: bytes(0, 255, 10, 13),
            });
            const read = await artifacts.findOneById(testUuid('a1'));

            expect(read).toEqual(artifact);
            expect(saved).toStrictEqual(read);
            expect(read!.createdAt).toBeInstanceOf(Date);
            expect(read).not.toHaveProperty('key');
            expect(read).not.toHaveProperty('data');
            expect(await artifacts.findOneBy({ runId: testUuid('r1'), key: 'tool:k' })).toEqual(artifact);
            expect((await artifacts.findMany(artifactsOf(testUuid('r1')))).data[0]).not.toHaveProperty('key');

            const empty = makeArtifact(testUuid('a2'), { size: 0, filename: undefined });

            await insert(artifacts, { ...empty, data: bytes() });
            expect((await artifacts.findOneById(testUuid('a2')))!.filename).toBeUndefined();
            expect(await dataOf(artifacts, testUuid('a2'))).toEqual([]);
        });

        it('readData returns the bytes as a plain Uint8Array copy; an unknown or malformed id is null', async () => {
            await insert(artifacts, { ...makeArtifact(testUuid('a1')), data: bytes(7, 8, 9) });

            const data = await artifacts.readData(testUuid('a1'));

            expect(data?.constructor).toBe(Uint8Array);
            expect(JSON.stringify(data)).toBe(JSON.stringify(bytes(7, 8, 9)));
            data![0] = 1;
            expect(await dataOf(artifacts, testUuid('a1'))).toEqual([7, 8, 9]);
            expect(await artifacts.readData(testUuid('missing'))).toBeNull();
            expect(await artifacts.readData('not-a-uuid')).toBeNull();
            expect(await artifacts.findOneById('not-a-uuid')).toBeNull();
            expect(await artifacts.findOneBy({ runId: 'not-a-uuid', key: 'k' })).toBeNull();
            expect((await artifacts.findMany(artifactsOf('not-a-uuid'))).data).toEqual([]);
        });

        it('stores a subarray and a Buffer by their own bytes only, and copies the bytes in', async () => {
            const backing = bytes(1, 2, 3, 4, 5);

            await insert(artifacts, { ...makeArtifact(testUuid('a1'), { size: 2 }), data: backing.subarray(1, 3) });
            await insert(artifacts, { ...makeArtifact(testUuid('a2')), data: Buffer.from([4, 5, 6]) });
            backing[1] = 9;
            expect(await dataOf(artifacts, testUuid('a1'))).toEqual([2, 3]);
            expect(await dataOf(artifacts, testUuid('a2'))).toEqual([4, 5, 6]);
        });

        it('a created artifact whose id is stored, or whose key its run holds, is EntityConflictError and leaves the stored row', async () => {
            await insert(artifacts, {
                ...makeArtifact(testUuid('a1'), { filename: 'first.txt' }),
                key: 'k',
                data: bytes(1),
            });

            await expect(insert(artifacts, { ...makeArtifact(testUuid('a1'), { filename: 'second.txt' }), data: bytes(2) }))
                .rejects.toBeInstanceOf(EntityConflictError);
            await expect(insert(artifacts, {
                ...makeArtifact(testUuid('a2')),
                key: 'k',
                data: bytes(3),
            }))
                .rejects.toBeInstanceOf(EntityConflictError);
            expect((await artifacts.findOneById(testUuid('a1')))!.filename).toBe('first.txt');
            expect(await artifacts.findOneById(testUuid('a2'))).toBeNull();
            expect(await dataOf(artifacts, testUuid('a1'))).toEqual([1]);
        });

        it('two runs may hold one key, and artifacts without a key never conflict', async () => {
            await insert(artifacts, {
                ...makeArtifact(testUuid('a1')),
                key: 'k',
                data: bytes(1),
            });
            await insert(artifacts, {
                ...makeArtifact(testUuid('a2'), { runId: testUuid('r2') }),
                key: 'k',
                data: bytes(2),
            });
            await insert(artifacts, { ...makeArtifact(testUuid('a3')), data: bytes(3) });
            await insert(artifacts, { ...makeArtifact(testUuid('a4')), data: bytes(4) });

            expect((await artifacts.findOneBy({ runId: testUuid('r1'), key: 'k' }))!.id).toBe(testUuid('a1'));
            expect((await artifacts.findOneBy({ runId: testUuid('r2'), key: 'k' }))!.id).toBe(testUuid('a2'));
            expect(await artifacts.findOneBy({ runId: testUuid('r1'), key: 'other' })).toBeNull();
        });

        it('save of a read artifact writes its changes and its new bytes; a property set to undefined is cleared', async () => {
            await insert(artifacts, {
                ...makeArtifact(testUuid('a1'), { mediaType: 'image/png' }),
                key: 'k',
                data: bytes(1, 2, 3),
            });

            const read = (await artifacts.findOneBy({ runId: testUuid('r1'), key: 'k' }))!;

            artifacts.merge(read, {
                mediaType: 'image/jpeg',
                filename: undefined,
                size: 1,
                data: bytes(9),
            });

            const saved = await artifacts.save(read);
            const stored = (await artifacts.findOneById(testUuid('a1')))!;

            expect(stored).toEqual({
                id: testUuid('a1'),
                runId: testUuid('r1'),
                agent: 'a',
                mediaType: 'image/jpeg',
                size: 1,
                createdAt: new Date(1_000),
            });
            expect(stored).not.toHaveProperty('filename');
            expect(saved).toStrictEqual(stored);
            expect(await dataOf(artifacts, testUuid('a1'))).toEqual([9]);
            expect((await artifacts.findOneBy({ runId: testUuid('r1'), key: 'k' }))!.id).toBe(testUuid('a1'));
        });

        it('findMany lists one run\'s artifacts by createdAt, then id, with the total', async () => {
            await insert(artifacts, { ...makeArtifact(testUuid('c'), { createdAt: new Date(2_000) }), data: bytes(1) });
            await insert(artifacts, { ...makeArtifact(testUuid('b'), { createdAt: new Date(1_000) }), data: bytes(1) });
            await insert(artifacts, { ...makeArtifact(testUuid('a'), { createdAt: new Date(2_000) }), data: bytes(1) });
            await insert(artifacts, { ...makeArtifact(testUuid('z'), { runId: testUuid('r2'), createdAt: new Date(500) }), data: bytes(1) });

            const { data, meta } = await artifacts.findMany(artifactsOf(testUuid('r1')));

            expect(data.map((artifact) => artifact.id)).toEqual([testUuid('b'), testUuid('a'), testUuid('c')]);
            expect(meta.total).toBe(3);
        });

        it('copies the metadata in and out', async () => {
            const artifact = makeArtifact(testUuid('a1'));

            await insert(artifacts, { ...artifact, data: bytes(1) });
            artifact.createdAt.setTime(0);
            artifact.mediaType = 'text/html';

            const read = (await artifacts.findOneById(testUuid('a1')))!;

            expect(read).toEqual(makeArtifact(testUuid('a1')));
            read.size = 99;
            expect(await artifacts.findOneById(testUuid('a1'))).toEqual(makeArtifact(testUuid('a1')));
        });

        it('concurrent inserts of one id, or of one key of a run: exactly one is stored', async () => {
            const byId = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => insert(artifacts, {
                ...makeArtifact(testUuid('a1'), { size: 1 }),
                data: bytes(i),
            })));
            const byKey = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => insert(artifacts, {
                ...makeArtifact(testUuid(`k${i}`), { size: 1 }),
                key: 'k',
                data: bytes(i),
            })));

            for (const results of [byId, byKey]) {
                expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
                expect(results.filter((result) => result.status === 'rejected')
                    .every((result) => (result as PromiseRejectedResult).reason instanceof EntityConflictError)).toBe(true);
            }

            expect((await artifacts.findMany(artifactsOf(testUuid('r1')))).meta.total).toBe(2);
            expect(await dataOf(artifacts, testUuid('a1'))).toEqual([byId.findIndex((result) => result.status === 'fulfilled')]);
        });
    });
}
