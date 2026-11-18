/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { EntityConflictError, EntityRelationError } from '@chamvi/store';
import type { Artifact } from '@chamvi/store';
import { MemoryArtifactRepository, MemoryRegistry } from '@chamvi/store-memory';
import {
    ArtifactNotFoundError,
    ArtifactService, 
    type IArtifactService,
    RepositoryNotFoundError,
    RunNotFoundError,
} from '../../../src/index.ts';

function uuid(label: string): string {
    const hex = Buffer.concat([Buffer.from(label), Buffer.alloc(16 - label.length)]).toString('hex');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function artifactOf(id: string, patch: Partial<Artifact> = {}): Artifact {
    return {
        id,
        runId: uuid('r1'),
        agent: 'a',
        mediaType: 'text/plain',
        filename: `${id}.txt`,
        size: 3,
        createdAt: new Date(1_000),
        ...patch,
    };
}

function bytes(...values: number[]): Uint8Array {
    return new Uint8Array(values);
}

describe('ArtifactService', () => {
    let repository: MemoryArtifactRepository;
    let artifacts: IArtifactService;

    const dataOf = async (id: string) => {
        const data = await artifacts.read(id);

        return data ? Array.from(data) : undefined;
    };

    beforeEach(() => {
        repository = new MemoryArtifactRepository({ registry: new MemoryRegistry() });
        artifacts = new ArtifactService({ repository });
    });

    it('create inserts if absent by id: a taken id resolves false and keeps the stored metadata and bytes', async () => {
        const first = artifactOf(uuid('a1'), { filename: 'first.txt' });

        expect(await artifacts.create(first, bytes(1, 2, 3))).toBe(true);
        expect(await artifacts.create(artifactOf(uuid('a1'), { filename: 'second.txt', size: 1 }), bytes(9))).toBe(false);
        expect(await artifacts.findOne(uuid('a1'))).toStrictEqual(first);
        expect(await dataOf(uuid('a1'))).toEqual([1, 2, 3]);
    });

    it('create with a key inserts only when the run has no artifact under it; the key is never read back', async () => {
        const first = artifactOf(uuid('a1'));

        expect(await artifacts.create(first, bytes(1), 'k')).toBe(true);
        expect(await artifacts.create(artifactOf(uuid('a2')), bytes(2), 'k')).toBe(false);
        expect(await artifacts.create(artifactOf(uuid('a3'), { runId: uuid('r2') }), bytes(3), 'k')).toBe(true);
        expect(await artifacts.findOneByKey(uuid('r1'), 'k')).toStrictEqual(first);
        expect(await artifacts.findOne(uuid('a2'))).toBeUndefined();
        expect(await artifacts.findOneByKey(uuid('r1'), 'other')).toBeUndefined();
        expect(await artifacts.findOneByKey('not-a-uuid', 'k')).toBeUndefined();
        expect(await artifacts.find(uuid('r1'))).toStrictEqual([first]);
    });

    it('concurrent creates of one id or one key: exactly one is stored', async () => {
        const byId = await Promise.all(Array.from({ length: 10 }, (_, i) => artifacts.create(artifactOf(uuid('a1'), { size: 1 }), bytes(i))));
        const byKey = await Promise.all(Array.from({ length: 10 }, (_, i) => artifacts.create(artifactOf(uuid(`k${i}`), { size: 1 }), bytes(i), 'k')));

        expect(byId.filter(Boolean)).toHaveLength(1);
        expect(byKey.filter(Boolean)).toHaveLength(1);
        expect(await artifacts.find(uuid('r1'))).toHaveLength(2);
    });

    it('save inserts an absent key and returns what the next read returns', async () => {
        const artifact = artifactOf(uuid('a1'));
        const saved = await artifacts.save(artifact, bytes(1, 2, 3), 'k');

        expect(saved).toStrictEqual(artifact);
        expect(await artifacts.findOne(uuid('a1'))).toStrictEqual(saved);
        expect(await artifacts.findOneByKey(uuid('r1'), 'k')).toStrictEqual(saved);
        expect(await dataOf(uuid('a1'))).toEqual([1, 2, 3]);
    });

    it('save of a stored key replaces the bytes, mediaType, filename and size and keeps the stored id, agent and createdAt', async () => {
        const first = artifactOf(uuid('a1'), { mediaType: 'image/png', filename: 'first.png' });

        await artifacts.create(first, bytes(1, 2, 3), 'k');

        const saved = await artifacts.save(artifactOf(uuid('a2'), {
            agent: 'other',
            mediaType: 'image/jpeg',
            filename: undefined,
            size: 1,
            createdAt: new Date(9_000),
        }), bytes(9), 'k');
        const expected: Artifact = {
            id: uuid('a1'),
            runId: uuid('r1'),
            agent: 'a',
            mediaType: 'image/jpeg',
            size: 1,
            createdAt: new Date(1_000),
        };

        expect(saved).toStrictEqual(expected);
        expect(await artifacts.findOne(uuid('a1'))).toStrictEqual(expected);
        expect(await artifacts.findOne(uuid('a2'))).toBeUndefined();
        expect(await dataOf(uuid('a1'))).toEqual([9]);
        expect(await artifacts.find(uuid('r1'))).toHaveLength(1);
    });

    it('save keeps the artifacts of other keys and of other runs', async () => {
        const other = artifactOf(uuid('a2'), { runId: uuid('r2') });

        await artifacts.save(artifactOf(uuid('a1')), bytes(1), 'k');
        await artifacts.save(artifactOf(uuid('a3')), bytes(3), 'k2');
        await artifacts.save(other, bytes(2), 'k');
        await artifacts.save(artifactOf(uuid('a4'), { size: 1 }), bytes(4), 'k');

        expect((await artifacts.find(uuid('r1'))).map((artifact) => artifact.id)).toEqual([uuid('a1'), uuid('a3')]);
        expect(await artifacts.find(uuid('r2'))).toStrictEqual([other]);
        expect(await dataOf(uuid('a1'))).toEqual([4]);
        expect(await dataOf(uuid('a3'))).toEqual([3]);
    });

    it('two first keyed saves of one artifact key keep one id', async () => {
        const [first, second] = await Promise.all([
            artifacts.save(artifactOf(uuid('a1'), { size: 1 }), bytes(1), 'k'),
            artifacts.save(artifactOf(uuid('a2'), { size: 1 }), bytes(2), 'k'),
        ]);

        expect(second!.id).toBe(first!.id);

        const listed = await artifacts.find(uuid('r1'));

        expect(listed).toHaveLength(1);
        expect(listed[0]!.id).toBe(first!.id);
        expect([[1], [2]]).toContainEqual(await dataOf(listed[0]!.id));
    });

    it('a keyed save that lost the insert race is retried once, in a new transaction', async () => {
        const conflicts: unknown[] = [];
        const racing = new class extends ArtifactService {
            protected override async write(artifact: Artifact, data: Uint8Array, key: string): Promise<Artifact> {
                try {
                    return await super.write(artifact, data, key);
                } catch (error) {
                    conflicts.push(error);

                    throw error;
                }
            }
        }({ repository });

        await Promise.all([
            racing.save(artifactOf(uuid('a1')), bytes(1), 'k'),
            racing.save(artifactOf(uuid('a2')), bytes(2), 'k'),
        ]);

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toBeInstanceOf(EntityConflictError);
    });

    it('a run the repository cannot reference is RunNotFoundError with today\'s message', async () => {
        // the transaction's bound repository shares the prototype, not the instance's own properties
        const save = vi.spyOn(MemoryArtifactRepository.prototype, 'save').mockRejectedValue(new EntityRelationError('artifact', 'run'));
        const refusing = new ArtifactService({ repository });

        try {
            for (const write of [
                () => refusing.create(artifactOf(uuid('a1'), { runId: 'missing' }), bytes(1)),
                () => refusing.save(artifactOf(uuid('a1'), { runId: 'missing' }), bytes(1), 'k'),
            ]) {
                const error = await write().catch((caught: unknown) => caught);

                expect(error).toBeInstanceOf(RunNotFoundError);
                expect(error).toMatchObject({ message: 'Run "missing" was not found.' });
            }
        } finally {
            save.mockRestore();
        }
    });

    it('reads: unknown or malformed ids are absent; OrFail throws today\'s errors with today\'s messages', async () => {
        expect(await artifacts.findOne('nope')).toBeUndefined();
        expect(await artifacts.read('nope')).toBeUndefined();
        expect(await artifacts.find('nope')).toEqual([]);

        const missing = await artifacts.findOneOrFail('nope').catch((caught: unknown) => caught);

        expect(missing).toBeInstanceOf(ArtifactNotFoundError);
        expect(missing).toMatchObject({ code: 'artifact_not_found', message: 'Artifact "nope" was not found.' });

        const empty = await artifacts.findOrFail(uuid('r1')).catch((caught: unknown) => caught);

        expect(empty).toBeInstanceOf(RepositoryNotFoundError);
        expect(empty).toMatchObject({ message: 'No matching artifacts were found.' });

        await artifacts.create(artifactOf(uuid('a1')), bytes(1));
        expect(await artifacts.findOneOrFail(uuid('a1'))).toStrictEqual(artifactOf(uuid('a1')));
        expect(await artifacts.findOrFail(uuid('r1'))).toStrictEqual([artifactOf(uuid('a1'))]);
    });

    it('find lists a run\'s artifacts by createdAt, then id; read returns a plain Uint8Array copy', async () => {
        await artifacts.create(artifactOf(uuid('c'), { createdAt: new Date(2_000) }), bytes(1));
        await artifacts.create(artifactOf(uuid('b'), { createdAt: new Date(1_000) }), bytes(1));
        await artifacts.create(artifactOf(uuid('a'), { createdAt: new Date(2_000) }), Buffer.from([4, 5, 6]));

        expect((await artifacts.find(uuid('r1'))).map((artifact) => artifact.id)).toEqual([uuid('b'), uuid('a'), uuid('c')]);

        const data = (await artifacts.read(uuid('a')))!;

        expect(data.constructor).toBe(Uint8Array);
        data[0] = 0;
        expect(await dataOf(uuid('a'))).toEqual([4, 5, 6]);
    });

    it('copies metadata and bytes in and out', async () => {
        const artifact = artifactOf(uuid('a1'));
        const data = bytes(1, 2, 3);

        const saved = await artifacts.save(artifact, data, 'k');

        data[0] = 9;
        artifact.mediaType = 'text/html';
        artifact.createdAt.setTime(0);
        saved.size = 99;
        expect(await dataOf(uuid('a1'))).toEqual([1, 2, 3]);
        expect(await artifacts.findOne(uuid('a1'))).toStrictEqual(artifactOf(uuid('a1')));

        await artifacts.save(artifactOf(uuid('a1'), { size: 2 }), data.subarray(0, 2), 'k');
        data[1] = 7;
        expect(await dataOf(uuid('a1'))).toEqual([9, 2]);
    });
});
