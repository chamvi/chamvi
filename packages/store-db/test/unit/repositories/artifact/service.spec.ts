/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { EntityConflictError, EntityRelationError } from '@chamvi/errors';
import type { DataSource, EntityManager } from 'typeorm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    expect,
    it,
} from 'vitest';
import { ArtifactService, type IArtifactService, RunNotFoundError } from '@chamvi/core';
import type { Artifact, ArtifactRecord } from '@chamvi/core-kit';
import { testUuid } from '@chamvi/test-kit';
import { DatabaseArtifactRepository } from '../../../../src/repositories/artifact/index.ts';
import { ArtifactEntity } from '../../../../src/entities/index.ts';
import { createBarrier } from '../../../utils/barrier.ts';
import type { Barrier } from '../../../utils/barrier.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../../utils/database.ts';

/**
 * Holds each transaction's single-row read at a barrier, so two first
 * saves both read before either writes; records the storage errors its
 * saves report.
 */
class BarrierArtifactRepository extends DatabaseArtifactRepository {
    protected barrier: Barrier;

    readonly failures: unknown[];

    constructor(source: DataSource | EntityManager, barrier: Barrier, failures: unknown[] = []) {
        super(source);
        this.barrier = barrier;
        this.failures = failures;
    }

    override withManager(manager: EntityManager): this {
        return new BarrierArtifactRepository(manager, this.barrier, this.failures) as this;
    }

    override async save(entity: ArtifactRecord): Promise<ArtifactRecord> {
        try {
            return await super.save(entity);
        } catch (error) {
            this.failures.push(error);

            throw error;
        }
    }

    override async findOneBy(where: Partial<ArtifactRecord>): Promise<ArtifactRecord | null> {
        const found = await super.findOneBy(where);

        if (this.tx) {
            await this.barrier.arrive();
        }

        return found;
    }
}

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

describePostgres('ArtifactService on PostgreSQL', () => {
    let dataSource: DataSource;
    let repository: DatabaseArtifactRepository;
    let artifacts: IArtifactService;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    beforeEach(async () => {
        await truncateRepository(dataSource);
        repository = new DatabaseArtifactRepository(dataSource);
        artifacts = new ArtifactService({ repository });
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('store the bytes as bytea and never loads them with the metadata', async () => {
        await artifacts.create(artifact(testUuid('a1')), new Uint8Array([0, 1, 255]));

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
        await artifacts.create(artifact(testUuid('a1')), new Uint8Array([7, 8, 9]));

        const bytes = await artifacts.read(testUuid('a1'));

        expect(bytes?.constructor).toBe(Uint8Array);
        expect(JSON.stringify(bytes)).toBe(JSON.stringify(new Uint8Array([7, 8, 9])));
    });

    it('store a Buffer view and a subarray by their own bytes only', async () => {
        const backing = new Uint8Array([1, 2, 3, 4, 5]);

        await artifacts.create(artifact(testUuid('a1'), { size: 2 }), backing.subarray(1, 3));
        expect(Array.from((await artifacts.read(testUuid('a1')))!)).toEqual([2, 3]);

        await artifacts.create(artifact(testUuid('a2')), Buffer.from([4, 5, 6]));
        expect(Array.from((await artifacts.read(testUuid('a2')))!)).toEqual([4, 5, 6]);
    });

    it('two concurrent healers of one key store one artifact', async () => {
        const runId = testUuid('r1');
        const contenders = [testUuid('a1'), testUuid('a2')];
        const results = await Promise.all(contenders.map((id, index) => artifacts.create(artifact(id), new Uint8Array([index]), 'attachment:0')));

        expect(results.filter(Boolean)).toHaveLength(1);

        const index = results.indexOf(true);
        const winner = await artifacts.findOneByKey(runId, 'attachment:0');

        expect(winner?.id).toBe(contenders[index]);
        expect(Array.from((await artifacts.read(winner!.id))!)).toEqual([index]);
        await expect(artifacts.find(runId)).resolves.toHaveLength(1);
    });

    it('the key is not selected by findOne or find', async () => {
        await artifacts.create(artifact(testUuid('a1')), new Uint8Array([1]), 'tool:private');

        const [row] = await dataSource.query('SELECT key FROM chamvi_artifacts WHERE id = $1', [testUuid('a1')]);

        expect(row.key).toBe('tool:private');
        expect(await artifacts.findOne(testUuid('a1'))).not.toHaveProperty('key');
        expect((await artifacts.find(testUuid('r1')))[0]).not.toHaveProperty('key');
        expect(await artifacts.findOneByKey(testUuid('r1'), 'tool:private')).not.toHaveProperty('key');
        expect((await dataSource.getRepository(ArtifactEntity).findOneBy({ id: testUuid('a1') }))!.key).toBeUndefined();
    });

    it('malformed ids are absent, and a write naming a malformed run is RunNotFoundError', async () => {
        await expect(artifacts.findOne('missing')).resolves.toBeUndefined();
        await expect(artifacts.read('missing')).resolves.toBeUndefined();
        await expect(artifacts.find('missing')).resolves.toEqual([]);
        await expect(artifacts.findOneByKey('missing', 'k')).resolves.toBeUndefined();
        await expect(artifacts.create(artifact(testUuid('a1'), { runId: 'missing' }), new Uint8Array([1]))).rejects.toBeInstanceOf(RunNotFoundError);
        await expect(artifacts.save(artifact(testUuid('a1'), { runId: 'missing' }), new Uint8Array([1]), 'k')).rejects.toBeInstanceOf(RunNotFoundError);
        // the repository refuses the run id its column cannot hold as a missing run, before the database sees it
        await expect(repository.save(repository.create({ ...artifact(testUuid('a1'), { runId: 'missing' }), data: new Uint8Array([1]) })))
            .rejects.toMatchObject({ entity: 'artifact', relation: 'run' });
        await expect(repository.save(repository.create({ ...artifact(testUuid('a1'), { runId: 'missing' }), data: new Uint8Array([1]) })))
            .rejects.toBeInstanceOf(EntityRelationError);
        await expect(repository.upsertMany([{ ...artifact(testUuid('a1'), { runId: 'missing' }), data: new Uint8Array([1]) }]))
            .rejects.toMatchObject({ entity: 'artifact', relation: 'run' });
        expect(await artifacts.find('missing')).toEqual([]);
    });

    it('save upserts by (run, key) and keeps the stored id, agent and createdAt', async () => {
        const first = await artifacts.save(artifact(testUuid('a1')), new Uint8Array([1]), 'tool:k');
        const second = await artifacts.save(artifact(testUuid('a2'), {
            agent: 'b',
            filename: undefined,
            size: 1,
            createdAt: new Date(9_000),
        }), new Uint8Array([2]), 'tool:k');

        expect(first.id).toBe(testUuid('a1'));
        expect(second).toStrictEqual({
            id: testUuid('a1'),
            runId: testUuid('r1'),
            agent: 'a',
            mediaType: 'application/octet-stream',
            size: 1,
            createdAt: new Date(1_000),
        });
        expect(second).toStrictEqual(await artifacts.findOne(testUuid('a1')));
        expect(Array.from((await artifacts.read(testUuid('a1')))!)).toEqual([2]);
        await expect(artifacts.findOne(testUuid('a2'))).resolves.toBeUndefined();
    });

    it('two first keyed saves of one artifact key keep one id', async () => {
        const racing = new ArtifactService({ repository: new BarrierArtifactRepository(dataSource, createBarrier(2)) });
        const [first, second] = await Promise.all([
            racing.save(artifact(testUuid('a1'), { size: 1 }), new Uint8Array([1]), 'k'),
            racing.save(artifact(testUuid('a2'), { size: 1 }), new Uint8Array([2]), 'k'),
        ]);

        expect(second.id).toBe(first.id);
        expect((await artifacts.find(testUuid('r1'))).map((stored) => stored.id)).toEqual([first.id]);
        expect([[1], [2]]).toContainEqual(Array.from((await artifacts.read(first.id))!));
    });

    it('a keyed save that lost the insert race is retried once, in a new transaction', async () => {
        const repository = new BarrierArtifactRepository(dataSource, createBarrier(2));
        const racing = new ArtifactService({ repository });

        await Promise.all([
            racing.save(artifact(testUuid('a1')), new Uint8Array([1]), 'k'),
            racing.save(artifact(testUuid('a2')), new Uint8Array([2]), 'k'),
        ]);

        // both first saves read no row, so both insert: the loser's conflict is retried and finds the row
        expect(repository.failures).toHaveLength(1);
        expect(repository.failures[0]).toBeInstanceOf(EntityConflictError);
        expect(await artifacts.find(testUuid('r1'))).toHaveLength(1);
    });
});
