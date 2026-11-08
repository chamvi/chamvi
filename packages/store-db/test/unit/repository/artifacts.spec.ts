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
import { RunNotFoundError } from '@chamvi/core';
import type { Artifact } from '@chamvi/core';
import { DatabaseArtifactRepository } from '@chamvi/store-db';
import { testUuid } from '@chamvi/test-kit';
import { ArtifactEntity } from '../../../src/entities/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../utils/database.ts';

const artifact = (id: string, overrides: Partial<Artifact> = {}): Artifact => ({
    id,
    runId: testUuid('r1'),
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

    it('store the bytes as bytea and never loads them with the metadata', async () => {
        await store.insert(artifact(testUuid('a1')), new Uint8Array([0, 1, 255]));

        const [{ type }] = await dataSource.query(
            'SELECT pg_typeof(data)::text AS type FROM chamvi_artifacts WHERE id = $1',
            [testUuid('a1')],
        );

        expect(type).toBe('bytea');

        const entity = await dataSource.getRepository(ArtifactEntity).findOneBy({ id: testUuid('a1') });

        expect(entity).not.toBeNull();
        expect(entity!.data).toBeUndefined();
    });

    it('reads bytes as a plain Uint8Array that serializes like one', async () => {
        await store.insert(artifact(testUuid('a1')), new Uint8Array([7, 8, 9]));

        const bytes = await store.read(testUuid('a1'));

        expect(bytes?.constructor).toBe(Uint8Array);
        expect(JSON.stringify(bytes)).toBe(JSON.stringify(new Uint8Array([7, 8, 9])));
    });

    it('store a Buffer view and a subarray by their own bytes only', async () => {
        const backing = new Uint8Array([1, 2, 3, 4, 5]);

        await store.insert(artifact(testUuid('a1'), { size: 2 }), backing.subarray(1, 3));
        expect(Array.from((await store.read(testUuid('a1')))!)).toEqual([2, 3]);

        await store.insert(artifact(testUuid('a2')), Buffer.from([4, 5, 6]));
        expect(Array.from((await store.read(testUuid('a2')))!)).toEqual([4, 5, 6]);
    });

    it('two concurrent healers of one key store one artifact', async () => {
        const runId = testUuid('r1');
        const contenders = [testUuid('a1'), testUuid('a2')];
        const results = await Promise.all(contenders.map((id, index) => store.insert(artifact(id), new Uint8Array([index]), 'attachment:0')));

        expect(results.filter(Boolean)).toHaveLength(1);

        const index = results.indexOf(true);
        const winner = await store.findOneByKey(runId, 'attachment:0');

        expect(winner?.id).toBe(contenders[index]);
        expect(Array.from((await store.read(winner!.id))!)).toEqual([index]);
        await expect(store.find(runId)).resolves.toHaveLength(1);
    });

    it('the key is not selected by findOne or find', async () => {
        await store.insert(artifact(testUuid('a1')), new Uint8Array([1]), 'tool:private');

        const [row] = await dataSource.query('SELECT key FROM chamvi_artifacts WHERE id = $1', [testUuid('a1')]);

        expect(row.key).toBe('tool:private');
        expect(await store.findOne(testUuid('a1'))).not.toHaveProperty('key');
        expect((await store.find(testUuid('r1')))[0]).not.toHaveProperty('key');
        expect(await store.findOneByKey(testUuid('r1'), 'tool:private')).not.toHaveProperty('key');
        expect((await dataSource.getRepository(ArtifactEntity).findOneBy({ id: testUuid('a1') }))!.key).toBeUndefined();
    });

    it('malformed ids are absent, and a write naming a malformed run is RunNotFoundError', async () => {
        await expect(store.findOne('missing')).resolves.toBeUndefined();
        await expect(store.read('missing')).resolves.toBeUndefined();
        await expect(store.find('missing')).resolves.toEqual([]);
        await expect(store.findOneByKey('missing', 'k')).resolves.toBeUndefined();
        await expect(store.insert(artifact(testUuid('a1'), { runId: 'missing' }), new Uint8Array([1]))).rejects.toBeInstanceOf(RunNotFoundError);
        await expect(store.save(artifact(testUuid('a1'), { runId: 'missing' }), new Uint8Array([1]), 'k')).rejects.toBeInstanceOf(RunNotFoundError);
    });

    it('save upserts by (run, key) and keeps the stored id, agent and createdAt', async () => {
        const first = await store.save(artifact(testUuid('a1')), new Uint8Array([1]), 'tool:k');
        const second = await store.save(artifact(testUuid('a2'), {
            agent: 'b',
            filename: undefined,
            size: 1,
            createdAt: new Date(9_000),
        }), new Uint8Array([2]), 'tool:k');

        expect(first.id).toBe(testUuid('a1'));
        expect(second).toEqual({
            id: testUuid('a1'),
            runId: testUuid('r1'),
            agent: 'a',
            mediaType: 'application/octet-stream',
            size: 1,
            createdAt: new Date(1_000),
        });
        expect(Array.from((await store.read(testUuid('a1')))!)).toEqual([2]);
        await expect(store.findOne(testUuid('a2'))).resolves.toBeUndefined();
    });
});
