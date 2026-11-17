/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { DataSource, EntitySchema } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { InvalidAgentDefinitionError } from '@chamvi/core';
import { createTestDataSource } from '@chamvi/test-kit';

type Counter = {
    id: string;
    name: string;
    version: number;
};

const CounterSchema = new EntitySchema<Counter>({
    name: 'counter',
    tableName: 'counters',
    columns: {
        id: { type: 'uuid', primary: true },
        name: {
            type: 'varchar',
            length: 64,
            unique: true,
        },
        version: { type: 'integer' },
    },
});

/** Two transactions that read the version, yield, then write it only when unchanged; how many wrote. */
async function compareAndSet(dataSource: DataSource, id: string): Promise<number> {
    const results = await Promise.allSettled([0, 1].map(() => dataSource.transaction(async (manager) => {
        const row = await manager.findOneByOrFail(CounterSchema, { id });

        // the other transaction gets its turn here when nothing serializes them
        await new Promise((resolve) => {
            setImmediate(resolve);
        });

        if (row.version !== 0) {
            return false;
        }

        await manager.update(CounterSchema, { id }, { version: row.version + 1 });

        return true;
    })));

    return results.filter((result) => result.status === 'fulfilled' && result.value).length;
}

describe('createTestDataSource', () => {
    it('gives a usable data source: SQLite in memory, its schema synchronized from the entities', async () => {
        const dataSource = await createTestDataSource({ entities: [CounterSchema] });

        try {
            expect(dataSource.options).toMatchObject({ type: 'better-sqlite3', database: ':memory:' });

            const repository = dataSource.getRepository(CounterSchema);
            const id = randomUUID();

            await repository.insert({
                id,
                name: 'a',
                version: 0,
            });

            expect(await repository.findOneBy({ id })).toEqual({
                id,
                name: 'a',
                version: 0,
            });
            await expect(repository.insert({
                id: randomUUID(),
                name: 'a',
                version: 0,
            })).rejects.toThrow();
        } finally {
            await dataSource.destroy();
        }
    });

    it('each call is a database of its own', async () => {
        const first = await createTestDataSource({ entities: [CounterSchema] });
        const second = await createTestDataSource({ entities: [CounterSchema] });

        try {
            await first.getRepository(CounterSchema).insert({
                id: randomUUID(),
                name: 'a',
                version: 0,
            });

            expect(await second.getRepository(CounterSchema).count()).toBe(0);
        } finally {
            await first.destroy();
            await second.destroy();
        }
    });

    it('guards a SQLite data source as an app\'s database is: of two concurrent compare-and-set transactions exactly one wins', async () => {
        const dataSource = await createTestDataSource({ entities: [CounterSchema] });

        try {
            const id = randomUUID();

            await dataSource.getRepository(CounterSchema).insert({
                id,
                name: 'a',
                version: 0,
            });

            expect(await compareAndSet(dataSource, id)).toBe(1);
            expect((await dataSource.getRepository(CounterSchema).findOneByOrFail({ id })).version).toBe(1);
        } finally {
            await dataSource.destroy();
        }
    });

    it('a plain better-sqlite3 data source lets both win: the guard is what makes the case above hold', async () => {
        const dataSource = await new DataSource({
            type: 'better-sqlite3',
            database: ':memory:',
            entities: [CounterSchema],
            synchronize: true,
        }).initialize();

        try {
            const id = randomUUID();

            await dataSource.getRepository(CounterSchema).insert({
                id,
                name: 'a',
                version: 0,
            });

            expect(await compareAndSet(dataSource, id)).not.toBe(1);
        } finally {
            await dataSource.destroy();
        }
    });

    it('refuses a URL that is no PostgreSQL URL, without the URL in the message', async () => {
        const marker = `pw${randomUUID().replaceAll('-', '')}`;

        const error = await createTestDataSource({ entities: [CounterSchema], url: `mysql://u:${marker}@127.0.0.1/x` }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((error as Error).message).not.toContain(marker);
    });
});
