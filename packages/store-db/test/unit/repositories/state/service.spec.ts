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
import { defineQuery, eq } from '@rapiq/core';
import { type IStateService, StateService } from '@chamvi/core';
import { DatabaseStateDocumentRepository, DatabaseStateRepository } from '../../../../src/repositories/state/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../../utils/database.ts';

describePostgres('StateService on PostgreSQL', () => {
    let dataSource: DataSource;
    let state: IStateService;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    beforeEach(async () => {
        await truncateRepository(dataSource);
        state = new StateService({
            repository: new DatabaseStateRepository(dataSource),
            documentRepository: new DatabaseStateDocumentRepository(dataSource),
        });
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    it('set and upsertDocument return what the next read returns; set undefined removes the key', async () => {
        expect(await state.set('a', 'k', { n: [1] })).toStrictEqual(await state.findOne('a', 'k'));
        expect(await state.upsertDocument('a', 'c', 'd', { n: 1 })).toStrictEqual((await state.findDocuments('a', 'c'))[0]);
        await state.set('a', 'k', undefined);
        expect(await state.findOne('a', 'k')).toBeUndefined();

        const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM chamvi_kv WHERE agent = $1', ['a']);

        expect(count).toBe(0);
    });

    it('findDocuments agrees with memory: nested values match by equality (not containment) and documents list by document id', async () => {
        await state.upsertDocument('a', 'c', 'b', { nested: { x: [1, 2], y: 1 }, k: null });
        await state.upsertDocument('a', 'c', 'a', { nested: { x: [1] }, k: 1 });
        await state.upsertDocument('a', 'c', 'c', { k: null, tags: ['x', 'y'] });

        const ids = async (where: Record<string, unknown>) => (await state.findDocuments('a', 'c', { where })).map((document) => document.id);

        await expect(ids({})).resolves.toEqual(['a', 'b', 'c']);
        await expect(ids({ nested: { x: [1] } })).resolves.toEqual(['a']);
        await expect(ids({ nested: { x: [1, 2], y: 1 } })).resolves.toEqual(['b']);
        await expect(ids({ tags: ['x'] })).resolves.toEqual([]);
        await expect(ids({ tags: ['x', 'y'] })).resolves.toEqual(['c']);
        await expect(ids({ k: null })).resolves.toEqual(['b', 'c']);
    });

    it('list and listDocuments page by a rapiq query as memory does: keys in code-point order, documents by top-level equality', async () => {
        for (const key of ['b', 'B', 'a', 'é']) {
            await state.set('a', key, key);
        }

        await state.set('other', 'x', true);

        const keys = async (query: Parameters<typeof defineQuery>[0]) => (await state.list('a', defineQuery(query))).map((entry) => entry.key);

        await expect(keys({})).resolves.toEqual(['B', 'a', 'b', 'é']);
        await expect(keys({ pagination: { limit: 2, offset: 1 } })).resolves.toEqual(['a', 'b']);
        await expect(keys({ sorts: { key: 'DESC' } })).resolves.toEqual(['é', 'b', 'a', 'B']);

        await state.upsertDocument('a', 'c', 'B', { k: 2, s: '2' });
        await state.upsertDocument('a', 'c', 'a', { k: 2 });
        await state.upsertDocument('a', 'c', 'b', { k: null });

        const ids = async (query: Parameters<typeof defineQuery>[0]) => (await state.listDocuments('a', 'c', defineQuery(query))).map((document) => document.id);

        await expect(ids({})).resolves.toEqual(['B', 'a', 'b']);
        await expect(ids({ filters: eq('k', 2) })).resolves.toEqual(['B', 'a']);
        await expect(ids({ filters: eq('s', 2) })).resolves.toEqual([]);
        await expect(ids({ filters: eq('k', null) })).resolves.toEqual(['b']);
        await expect(ids({ filters: eq('k', 2), pagination: { limit: 1 } })).resolves.toEqual(['B']);
    });

    it('concurrent sets of one key and upserts of one document all resolve and leave one row each', async () => {
        await Promise.all([
            ...Array.from({ length: 10 }, (_, i) => state.set('a', 'k', i)),
            ...Array.from({ length: 10 }, (_, i) => state.upsertDocument('a', 'c', 'd', { i })),
        ]);

        expect(await state.find('a')).toHaveLength(1);
        expect(await state.findDocuments('a', 'c')).toHaveLength(1);
    });
});
