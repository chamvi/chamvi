/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    it,
} from 'vitest';
import type { Artifact } from '@chamvi/core';
import { DatabaseArtifactRepository } from '@chamvi/store-db';
import { ArtifactEntity } from '../../../src/entities/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../utils/database.ts';

const ARTIFACT_1 = '019a3f2a-1000-7000-8000-000000000001';
const ARTIFACT_2 = '019a3f2a-1000-7000-8000-000000000002';
const RUN = '019a3f2a-1000-7000-8000-000000000003';

const artifact = (id: string, overrides: Partial<Artifact> = {}): Artifact => ({
    id,
    runId: RUN,
    agent: 'a',
    mediaType: 'application/octet-stream',
    filename: `${id}.bin`,
    size: 3,
    createdAt: new Date(1_000),
    ...overrides,
});

describePostgres('DatabaseArtifactRepository artifacts', () => {
    let dataSource: DataSource;
    let store: DatabaseArtifactRepository;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    beforeEach(async () => {
        await truncateRepository(dataSource);
        store = new DatabaseArtifactRepository({ dataSource });
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('treats malformed artifact and run identifiers as absent', async () => {
        await store.insert(artifact(ARTIFACT_1), new Uint8Array([1, 2, 3]));

        for (const id of ['', 'missing', 'not-a-uuid']) {
            expect(await store.findOne(id)).toBeUndefined();
            expect(await store.read(id)).toBeUndefined();
            expect(await store.find(id)).toEqual([]);
            await expect(store.findOneOrFail(id)).rejects.toMatchObject({ code: 'artifact_not_found' });
        }

        expect(await store.read(ARTIFACT_1)).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('store the bytes as bytea and never loads them with the metadata', async () => {
        await store.insert(artifact(ARTIFACT_1), new Uint8Array([0, 1, 255]));

        const [{ type }] = await dataSource.query(
            'SELECT pg_typeof(data)::text AS type FROM chamvi_artifacts WHERE id = $1',
            [ARTIFACT_1],
        );

        expect(type).toBe('bytea');

        const entity = await dataSource.getRepository(ArtifactEntity).findOneBy({ id: ARTIFACT_1 });

        expect(entity).not.toBeNull();
        expect(entity!.data).toBeUndefined();
    });

    it('reads bytes as a plain Uint8Array that serializes like one', async () => {
        await store.insert(artifact(ARTIFACT_1), new Uint8Array([7, 8, 9]));

        const bytes = await store.read(ARTIFACT_1);

        expect(bytes?.constructor).toBe(Uint8Array);
        expect(JSON.stringify(bytes)).toBe(JSON.stringify(new Uint8Array([7, 8, 9])));
    });

    it('store a Buffer view and a subarray by their own bytes only', async () => {
        const backing = new Uint8Array([1, 2, 3, 4, 5]);

        await store.insert(artifact(ARTIFACT_1, { size: 2 }), backing.subarray(1, 3));
        expect(Array.from((await store.read(ARTIFACT_1))!)).toEqual([2, 3]);

        await store.insert(artifact(ARTIFACT_2), Buffer.from([4, 5, 6]));
        expect(Array.from((await store.read(ARTIFACT_2))!)).toEqual([4, 5, 6]);
    });
});
