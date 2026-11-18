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
import { testUuid } from '@chamvi/test-kit';
import { DatabaseConnectionRepository } from '../../../src/repositories/connection/index.ts';
import { createTestDataSource, describePostgres, truncateRepository } from '../../utils/database.ts';

const CONNECTION = testUuid('connection');

// PostgreSQL stores a uuid in its canonical lower case: an upsert key given in upper case still names the stored row.
describePostgres('an upsert by an upsert key the database normalizes', () => {
    let dataSource: DataSource;
    let connections: DatabaseConnectionRepository;

    beforeAll(async () => {
        dataSource = await createTestDataSource();
    });

    afterAll(async () => {
        await dataSource.destroy();
    });

    beforeEach(async () => {
        await truncateRepository(dataSource);
        connections = new DatabaseConnectionRepository(dataSource);
        await connections.save(connections.create({
            id: CONNECTION,
            name: 'wa',
            type: 'whatsapp',
            keyId: 'k1',
            wrappedKey: new Uint8Array([1]),
            settings: {},
            configRevision: 0,
            createdAt: new Date(1_000),
            updatedAt: new Date(1_000),
        }));
    });

    it('a single upsert outside a transaction with an upper-case uuid key writes one row and resolves what the next read returns', async () => {
        const first = await connections.entries.upsert({
            id: testUuid('entry-1'),
            connectionId: CONNECTION.toUpperCase(),
            key: 'k',
            value: new Uint8Array([1]),
        });
        const read = await connections.entries.findOneBy({ connectionId: CONNECTION, key: 'k' });

        expect(first).toStrictEqual(read);
        expect(first.connectionId).toBe(CONNECTION);

        const second = await connections.entries.upsert({
            id: testUuid('entry-2'),
            connectionId: CONNECTION.toUpperCase(),
            key: 'k',
            value: new Uint8Array([2]),
        });

        expect(second).toStrictEqual(await connections.entries.findOneBy({ connectionId: CONNECTION, key: 'k' }));
        expect(second.id).toBe(testUuid('entry-1'));
        expect(await connections.entries.findManyBy({ connectionId: CONNECTION })).toHaveLength(1);
    });

    it('a single upsert refused by a reference writes nothing', async () => {
        await expect(connections.entries.upsert({
            id: testUuid('entry-1'),
            connectionId: testUuid('missing'),
            key: 'k',
            value: new Uint8Array([1]),
        })).rejects.toMatchObject({ code: 'entity_relation_invalid' });
        expect(await connections.entries.findManyBy({ key: 'k' })).toEqual([]);
    });
});
