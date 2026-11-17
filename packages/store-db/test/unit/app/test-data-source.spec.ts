/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, it } from 'vitest';
import { createTestDataSource } from '@chamvi/test-kit';
import { describePostgres, postgres } from '../../utils/database.ts';
import { databaseExists } from '../../utils/migration.ts';
import { NoteEntity } from '../../fixtures/notes/entity.ts';

// One createTestDataSource({ url }) with its destroy() takes 0.1 to 0.35 s (measured at load average 25:
// CREATE DATABASE 40 to 80 ms, DROP ... WITH (FORCE) 20 to 35 ms). The 120 s limits are for a starved
// PostgreSQL container under a loaded machine, where every spec of this package stalled past 30 s.
describePostgres('createTestDataSource on PostgreSQL', () => {
    it('is a database of its own on the server, its schema synchronized, UTC pinned, dropped again by destroy', async () => {
        const {
            username,
            password,
            host,
            port,
        } = postgres!;
        const url = `postgres://${username}:${password}@${host}:${port}/postgres`;
        const first = await createTestDataSource({ entities: [NoteEntity], url });
        const second = await createTestDataSource({ entities: [NoteEntity], url });
        const name = first.driver.database!;

        try {
            expect(name).toMatch(/^chamvi_test_[0-9a-f]{32}$/);
            expect(second.driver.database).not.toBe(name);

            await first.getRepository(NoteEntity).insert({
                id: '00000000-0000-7000-8000-000000000001',
                title: 'a',
                version: 0,
                dueAt: '2026-01-01T00:00:00.000Z',
            });

            expect(await first.getRepository(NoteEntity).count()).toBe(1);
            expect(await second.getRepository(NoteEntity).count()).toBe(0);

            const [{ TimeZone: zone }] = await first.query('SHOW TIME ZONE') as [{ TimeZone: string }];

            expect(zone).toBe('UTC');
        } finally {
            await first.destroy();
            await second.destroy();
        }

        expect(await databaseExists(name)).toBe(false);
    }, 120_000);
});

describePostgres('createTestDataSource on PostgreSQL when closing fails', () => {
    it('still drops its database, and destroy() rejects with the failure', async () => {
        const {
            username,
            password,
            host,
            port,
        } = postgres!;
        const dataSource = await createTestDataSource({ entities: [NoteEntity], url: `postgres://${username}:${password}@${host}:${port}/postgres` });
        const name = dataSource.driver.database!;

        dataSource.driver.disconnect = async () => {
            throw new Error('the pool would not close');
        };

        await expect(dataSource.destroy()).rejects.toThrow('the pool would not close');
        expect(await databaseExists(name)).toBe(false);
    }, 120_000);
});
