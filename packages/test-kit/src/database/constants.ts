/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The package an app's database code lives in, loaded by `createTestDataSource` only. */
export const STORE_DB_PACKAGE = '@chamvi/store-db';

/** The migrations table the test data source's options name (no migration runs: the schema is synchronized). */
export const TEST_MIGRATIONS_TABLE = 'test_migrations';

/** How long a PostgreSQL server may take to accept a test connection. */
export const TEST_CONNECT_TIMEOUT_MS = 10_000;
