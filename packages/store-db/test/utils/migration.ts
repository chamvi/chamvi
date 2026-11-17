/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { DataSource, EntitySchema } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { createDatabase, dropDatabase } from 'typeorm-extension';
import type { MigrationDescriptor, MigrationOperationInput } from '../../src/migration/index.ts';
import { postgres } from './database.ts';

type Note = {
    id: string;
    title: string;
    rating?: number | null
};

/** The fixture entity: `notes` (id, title). */
export function notesV1(): EntitySchema<Note> {
    return new EntitySchema<Note>({
        name: 'note',
        tableName: 'notes',
        columns: {
            id: {
                type: 'varchar',
                length: 36,
                primary: true,
            },
            title: { type: 'varchar', length: 200 },
        },
    });
}

/** The fixture entity after it gained a column: `notes` (id, title, rating). */
export function notesV2(): EntitySchema<Note> {
    return new EntitySchema<Note>({
        name: 'note',
        tableName: 'notes',
        columns: {
            id: {
                type: 'varchar',
                length: 36,
                primary: true,
            },
            title: { type: 'varchar', length: 200 },
            rating: { type: 'integer', nullable: true },
        },
    });
}

/** The fixture entity with a column whose type needs a PostgreSQL extension (`hstore`). */
export function notesWithExtension(): EntitySchema<Note & { tags?: Record<string, string> | null }> {
    return new EntitySchema<Note & { tags?: Record<string, string> | null }>({
        name: 'note',
        tableName: 'notes',
        columns: {
            id: {
                type: 'varchar',
                length: 36,
                primary: true,
            },
            title: { type: 'varchar', length: 200 },
            tags: { type: 'hstore', nullable: true },
        },
    });
}

/** The extensions a test database has installed, sorted. */
export async function extensionsOf(database: string): Promise<string[]> {
    const dataSource = await openPlain(database);

    try {
        const rows: Array<{ name: string }> = await dataSource.query('SELECT extname AS "name" FROM pg_extension ORDER BY extname');

        return rows.map((row) => row.name);
    } finally {
        await dataSource.destroy();
    }
}

export type UrlSpelling = {
    protocol?: string;
    username?: string;
    password?: string;
    host?: string;
    port?: string | null;
    /** What follows the host and port: `/name`, `/name/`, `/name?x=y`. */
    rest?: string;
};

/** A URL of the test server; the password is the server's unless given. */
export function postgresUrl(database: string, spelling: UrlSpelling = {}): string {
    if (!postgres) {
        throw new Error('Postgres is not available.');
    }

    const protocol = spelling.protocol ?? 'postgres';
    const username = encodeURIComponent(spelling.username ?? postgres.username);
    const password = encodeURIComponent(spelling.password ?? postgres.password);
    const host = spelling.host ?? postgres.host;
    const port = spelling.port === null ? '' : `:${spelling.port ?? postgres.port}`;

    return `${protocol}://${username}:${password}@${host}${port}${spelling.rest ?? `/${database}`}`;
}

/** A new, empty database on the test server; its name. */
export async function createTestDatabase(prefix = 'chamvi_mig'): Promise<string> {
    if (!postgres) {
        throw new Error('Postgres is not available.');
    }

    const database = `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;

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

    return database;
}

export async function dropTestDatabase(database: string): Promise<void> {
    await dropDatabase({
        options: {
            type: 'postgres',
            ...postgres!,
            database,
        },
        initialDatabase: 'postgres',
        ifExist: true,
    });
}

/** Opens a plain data source on a test database, for seeding and asserting. */
export async function openPlain(database: string): Promise<DataSource> {
    const dataSource = new DataSource({
        type: 'postgres',
        ...postgres!,
        database,
        logging: false,
    });

    await dataSource.initialize();

    return dataSource;
}

/** Whether the test server holds the database. */
export async function databaseExists(database: string): Promise<boolean> {
    const dataSource = await openPlain('postgres');

    try {
        const rows: unknown[] = await dataSource.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);

        return rows.length > 0;
    } finally {
        await dataSource.destroy();
    }
}

/** A test database's comment, as `generate` marks its scratch database. */
export async function databaseComment(database: string): Promise<string | null> {
    const dataSource = await openPlain('postgres');

    try {
        const [row] = await dataSource.query(
            'SELECT shobj_description(oid, \'pg_database\') AS "comment" FROM pg_database WHERE datname = $1',
            [database],
        ) as Array<{ comment: string | null }>;

        return row?.comment ?? null;
    } finally {
        await dataSource.destroy();
    }
}

/** The owner of a test database. */
export async function databaseOwner(database: string): Promise<string> {
    const dataSource = await openPlain('postgres');

    try {
        const [row] = await dataSource.query(
            'SELECT pg_get_userbyid(datdba) AS "owner" FROM pg_database WHERE datname = $1',
            [database],
        ) as Array<{ owner: string }>;

        return row!.owner;
    } finally {
        await dataSource.destroy();
    }
}

/** The tables of a test database's `public` schema, sorted. */
export async function tablesOf(database: string): Promise<string[]> {
    const dataSource = await openPlain(database);

    try {
        const rows: { name: string }[] = await dataSource.query(
            'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name',
        );

        return rows.map((row) => row.name);
    } finally {
        await dataSource.destroy();
    }
}

/**
 * A migration class named `name` that runs the statements TypeORM would
 * generate for `entities` against an empty database (what a generated
 * first migration holds), and drops the tables again in `down`.
 */
export async function schemaMigration(name: string, entities: EntitySchema<any>[]): Promise<new () => MigrationInterface> {
    const database = await createTestDatabase('chamvi_mig_schema');
    const dataSource = new DataSource({
        type: 'postgres',
        ...postgres!,
        database,
        entities,
        logging: false,
    });

    try {
        await dataSource.initialize();

        const sql = await dataSource.driver.createSchemaBuilder().log();
        const up = sql.upQueries.map((query) => query.query);
        const down = sql.downQueries.map((query) => query.query).reverse();

        return class implements MigrationInterface {
            name = name;

            async up(queryRunner: QueryRunner): Promise<void> {
                for (const statement of up) {
                    await queryRunner.query(statement);
                }
            }

            async down(queryRunner: QueryRunner): Promise<void> {
                for (const statement of down) {
                    await queryRunner.query(statement);
                }
            }
        };
    } finally {
        await dataSource.destroy();
        await dropTestDatabase(database);
    }
}

/** The descriptor of the fixture database `notes`. */
export function notesDescriptor(overrides: Partial<MigrationDescriptor> = {}): MigrationDescriptor {
    return {
        name: 'notes',
        entities: [notesV1()],
        migrations: [],
        migrationsDirectory: '/nonexistent',
        migrationsTableName: 'notes_migrations',
        lockName: 'chamvi:db:notes',
        ...overrides,
    };
}

export type RecordedInput = MigrationOperationInput & { lines: string[] };

/** An operation input whose output lines are recorded in `lines`. */
export function recordedInput(input: Omit<MigrationOperationInput, 'write'>): RecordedInput {
    const lines: string[] = [];

    return {
        ...input,
        lines,
        write: (line) => {
            lines.push(line);
        },
    };
}
