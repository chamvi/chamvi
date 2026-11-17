/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { DataSource, EntitySchema } from 'typeorm';
import { createDatabase } from 'typeorm-extension';
import { describe, expect, it } from 'vitest';
import { dateToISOStringTransformer } from '../../../src/column/index.ts';
import { postgres } from '../../utils/database.ts';

type Stamp = {
    id: string;
    at: string;
    seenAt: string | null;
};

function stampSchema(driver: 'postgres' | 'better-sqlite3') {
    const type = driver === 'postgres' ? 'timestamp with time zone' : 'datetime';

    return new EntitySchema<Stamp>({
        name: 'stamp',
        tableName: 'test_stamps',
        columns: {
            id: { type: 'uuid', primary: true },
            at: { type, transformer: dateToISOStringTransformer },
            seenAt: {
                name: 'seen_at',
                type,
                nullable: true,
                transformer: dateToISOStringTransformer,
            },
        },
    });
}

async function open(driver: 'postgres' | 'better-sqlite3'): Promise<DataSource> {
    const entities = [stampSchema(driver)];

    if (driver === 'better-sqlite3') {
        return new DataSource({
            type: 'better-sqlite3',
            database: ':memory:',
            entities,
            synchronize: true,
        }).initialize();
    }

    const database = `chamvi_stamp_${randomUUID().replaceAll('-', '')}`;

    await createDatabase({
        options: {
            type: 'postgres',
            ...postgres!,
            database,
        },
        initialDatabase: 'postgres',
        ifNotExist: false,
        synchronize: false,
    });

    return new DataSource({
        type: 'postgres',
        ...postgres!,
        database,
        entities,
        synchronize: true,
        extra: { options: '-c TimeZone=America/New_York' },
    }).initialize();
}

describe('dateToISOStringTransformer', () => {
    it('turns a Date into its ISO string in both directions and passes a string, null and undefined through', () => {
        const date = new Date(Date.UTC(2026, 10, 16, 12, 30, 15, 250));

        for (const direction of ['to', 'from'] as const) {
            const transform = dateToISOStringTransformer[direction] as (value: unknown) => unknown;

            expect(transform(date)).toBe('2026-11-16T12:30:15.250Z');
            expect(transform('2026-11-16T12:30:15.250Z')).toBe('2026-11-16T12:30:15.250Z');
            expect(transform(null)).toBeNull();
            expect(transform(undefined)).toBeUndefined();
        }
    });

    it.each([
        { driver: 'better-sqlite3' as const, skip: false },
        { driver: 'postgres' as const, skip: !postgres },
    ])('a date column reads as the ISO 8601 UTC string it was written as on $driver', async ({ driver, skip }) => {
        if (skip) {
            return;
        }

        const dataSource = await open(driver);

        try {
            const repository = dataSource.getRepository<Stamp>('stamp');
            const id = randomUUID();

            await repository.insert({
                id,
                at: '2026-11-16T12:30:15.250Z',
                seenAt: null,
            });

            expect(await repository.findOneByOrFail({ id })).toEqual({
                id,
                at: '2026-11-16T12:30:15.250Z',
                seenAt: null,
            });

            await repository.update({ id }, { seenAt: new Date(Date.UTC(2026, 0, 2)) as never });

            expect((await repository.findOneByOrFail({ id })).seenAt).toBe('2026-01-02T00:00:00.000Z');
        } finally {
            await dataSource.destroy();
        }
    });
});
