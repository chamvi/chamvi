/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createDatabase, dropDatabase } from 'typeorm-extension';
import { describe, inject } from 'vitest';

export type PostgresConnection = {
    host: string;
    port: number;
    username: string;
    password: string;
};

declare module 'vitest' {
    // Vitest's augmentation name is fixed by its public API.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface ProvidedContext {
        postgres: PostgresConnection;
    }
}

export const postgres: PostgresConnection | undefined = inject('postgres');

export function describePostgres(name: string, fn: () => void): void {
    describe.skipIf(!postgres)(name, fn);
}

function server(): PostgresConnection {
    if (!postgres) {
        throw new Error('Postgres is not available.');
    }

    return postgres;
}

export type UrlSpelling = {
    protocol?: string;
    username?: string;
    password?: string;
    host?: string;
    /** What follows the host and port: `/name`, `/name/`, `/name?x=y`. */
    rest?: string;
};

/** A URL of the test server in a given spelling. */
export function postgresUrl(database: string, spelling: UrlSpelling = {}): string {
    const {
        host,
        port,
        username,
        password,
    } = server();

    return `${spelling.protocol ?? 'postgres'}://${encodeURIComponent(spelling.username ?? username)}:` +
        `${encodeURIComponent(spelling.password ?? password)}@${spelling.host ?? host}:${port}${spelling.rest ?? `/${database}`}`;
}

/** A new, empty database on the test server; its name. */
export async function createTestDatabase(prefix = 'chamvi_cli'): Promise<string> {
    const database = `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;

    await createDatabase({
        options: {
            type: 'postgres',
            ...server(),
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
            ...server(),
            database,
        },
        initialDatabase: 'postgres',
        ifExist: true,
    });
}

/** Runs `fn` on a plain data source of a test database. */
export async function withDatabase<R>(database: string, fn: (dataSource: DataSource) => Promise<R>): Promise<R> {
    const dataSource = new DataSource({
        type: 'postgres',
        ...server(),
        database,
        logging: false,
    });

    await dataSource.initialize();

    try {
        return await fn(dataSource);
    } finally {
        await dataSource.destroy();
    }
}

/** The tables of a test database's `public` schema, sorted. */
export async function tablesOf(database: string): Promise<string[]> {
    return withDatabase(database, async (dataSource) => {
        const rows: Array<{ name: string }> = await dataSource.query(
            'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name',
        );

        return rows.map((row) => row.name);
    });
}
