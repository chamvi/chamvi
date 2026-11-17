/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ControllableClock } from '@chamvi/test-kit';
import { EntitySchema } from 'typeorm';
import { describe, expect, it } from 'vitest';
import {
    DatabaseBusyError,
    DatabaseOptionsError,
    DatabaseUnavailableError,
    buildDatabaseOptions,
    closeDatabase,
    connectDatabase,
    synchronizeDatabase,
} from '../../../src/index.ts';

const NOTES = new EntitySchema<{ id: string; title: string }>({
    name: 'database_note',
    tableName: 'database_notes',
    columns: {
        id: {
            type: 'varchar',
            length: 36,
            primary: true,
        },
        title: { type: 'varchar', length: 64 },
    },
});

function sqlite() {
    return buildDatabaseOptions({
        entities: [NOTES],
        migrations: [],
        migrationsTableName: 'notes_migrations',
        connectTimeoutMs: 1_000,
        production: false,
        mode: 'start',
    }).options;
}

describe('an app database on SQLite', () => {
    it('passes the wait limit on to the guard', async () => {
        const clock = new ControllableClock(new Date('2026-11-17T00:00:00.000Z'));
        const dataSource = await connectDatabase(sqlite(), { waitTimeoutMs: 1_000, clock });
        const runner = dataSource.createQueryRunner();

        await runner.startTransaction();

        const waiting = dataSource.query('SELECT 1');

        clock.advance(1_000);
        await expect(waiting).rejects.toThrow(DatabaseBusyError);
        await expect(waiting).rejects.toMatchObject({ waitedMs: 1_000 });

        await runner.rollbackTransaction();
        await closeDatabase(dataSource);
    });

    it('connects, synchronizes the entities and closes', async () => {
        const dataSource = await connectDatabase(sqlite());

        await synchronizeDatabase(dataSource);
        await dataSource.manager.insert('database_note', { id: 'n1', title: 'first' });

        expect(await dataSource.manager.count('database_note')).toBe(1);

        await closeDatabase(dataSource);
        expect(dataSource.isInitialized).toBe(false);
        // closing twice is a no-op
        await closeDatabase(dataSource);
    });

    it('a failure names the operation and the driver code only, never a cause', async () => {
        const dataSource = await connectDatabase(sqlite());

        await closeDatabase(dataSource);

        const error = await synchronizeDatabase(dataSource).then(() => undefined, (e: unknown) => e);

        expect(error).toBeInstanceOf(DatabaseUnavailableError);
        expect((error as DatabaseUnavailableError).operation).toBe('synchronize');
        expect((error as Error).cause).toBeUndefined();
    });

    describe('an entity mistake is a configuration error with TypeORM\'s message', () => {
        function options(entities: EntitySchema<any>[]) {
            return buildDatabaseOptions({
                entities,
                migrations: [],
                migrationsTableName: 'notes_migrations',
                connectTimeoutMs: 1_000,
                production: false,
                mode: 'start',
            }).options;
        }

        it('a relation to an entity the database does not list', async () => {
            const orphan = new EntitySchema<{ id: string; owner?: unknown }>({
                name: 'database_orphan',
                tableName: 'database_orphans',
                columns: {
                    id: {
                        type: 'varchar',
                        length: 36,
                        primary: true,
                    },
                },
                relations: { owner: { type: 'many-to-one', target: 'database_unlisted' } },
            });

            const error = await connectDatabase(options([orphan])).then(() => undefined, (e: unknown) => e);

            expect(error).toBeInstanceOf(DatabaseOptionsError);
            expect(error).toMatchObject({ code: 'database_options_invalid' });
            expect((error as Error).message).toContain('database_orphan#owner');
        });

        it('an entity without a primary column', async () => {
            const bare = new EntitySchema<{ title: string }>({
                name: 'database_bare',
                tableName: 'database_bares',
                columns: { title: { type: 'varchar', length: 64 } },
            });

            const error = await connectDatabase(options([bare])).then(() => undefined, (e: unknown) => e);

            expect(error).toBeInstanceOf(DatabaseOptionsError);
            expect((error as Error).message).toContain('database_bare');
            expect((error as Error).message).toContain('primary column');
        });
    });
});
