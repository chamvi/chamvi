/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { Logger, MigrationInterface } from 'typeorm';
import { createDatabase } from 'typeorm-extension';
import { queueDataSource } from '../../../src/database/index.ts';
import type { QueueDataSourceOptions } from '../../../src/database/index.ts';
import { postgres } from '../database.ts';
import { createFixtureSchemas } from './schemas.ts';
import type { FixtureDriver, FixtureSchemas } from './schemas.ts';

export type FixtureDataSource = {
    driver: FixtureDriver;
    dataSource: DataSource;
    schemas: FixtureSchemas;
    /** The connection URL of a PostgreSQL data source (with its password). */
    url?: string;
    clear(): Promise<void>;
};

export type FixtureDataSourceOptions = {
    logger?: Logger;
    /** better-sqlite3 only: guard the data source (`queueDataSource`), as an app's database does; an object sets the guard's options. */
    guard?: boolean | QueueDataSourceOptions;
    /** Migration classes of the data source (never run on connect). */
    migrations?: Array<new () => MigrationInterface>;
};

/**
 * A data source holding only the fixture tables, created by `synchronize`:
 * a fresh PostgreSQL database (connected through a URL), or SQLite in
 * memory.
 */
export async function openFixtureDataSource(
    driver: FixtureDriver,
    options: FixtureDataSourceOptions = {},
): Promise<FixtureDataSource> {
    const schemas = createFixtureSchemas(driver);
    const entities = [schemas.parent, schemas.child, schemas.claim, schemas.record];
    const logging = options.logger ? { logger: options.logger, logging: ['query' as const] } : {};
    let dataSource: DataSource;
    let url: string | undefined;

    if (driver === 'postgres') {
        if (!postgres) {
            throw new Error('Postgres is not available.');
        }

        const database = `chamvi_entity_${randomUUID().replaceAll('-', '')}`;

        await createDatabase({
            options: {
                type: 'postgres',
                ...postgres,
                database,
            },
            initialDatabase: 'postgres',
            ifNotExist: false,
            synchronize: false,
        });

        url = `postgres://${postgres.username}:${postgres.password}@${postgres.host}:${postgres.port}/${database}`;
        dataSource = new DataSource({
            type: 'postgres',
            url,
            entities,
            migrations: options.migrations ?? [],
            migrationsTableName: 'fixture_migrations',
            synchronize: true,
            extra: { max: 25 },
            ...logging,
        });
    } else {
        dataSource = new DataSource({
            type: 'better-sqlite3',
            database: ':memory:',
            entities,
            migrations: options.migrations ?? [],
            synchronize: true,
            ...logging,
        });

        if (options.guard) {
            queueDataSource(dataSource, options.guard === true ? {} : options.guard);
        }
    }

    await dataSource.initialize();

    return {
        driver,
        dataSource,
        schemas,
        url,
        async clear() {
            await dataSource.getRepository(schemas.child).clear();
            await dataSource.getRepository(schemas.claim).clear();
            await dataSource.getRepository(schemas.record).clear();
            // a referenced table cannot be truncated on PostgreSQL: delete its rows
            await dataSource.getRepository(schemas.parent).createQueryBuilder().delete().execute();
        },
    };
}
