/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { TypedToken } from 'eldin';
import type { DataSource } from 'typeorm';
import { DEFAULT_DATABASE_NAME } from './constants.ts';
import type { DatabaseDescriptor, DatabaseTokens } from './types.ts';

const dataSourceTokens = new Map<string, TypedToken<DataSource>>();

/**
 * The token of the data source of the database module named `name`
 * (default `default`), the same token on every call. Registered once the
 * data source is connected (and migrated or synchronized), so a module
 * that lists `chamvi:db:<name>` in its `dependencies` resolves it in
 * `setup`. On SQLite the data source is guarded for concurrent use
 * (`queueDataSource` of `@chamvi/store-db`): a statement, a transaction
 * or a whole `synchronize()` has its one connection alone, the others
 * wait their turn, and work inside a `transaction()` callback or a
 * subscriber joins it through any handle. Two limits: inside a
 * transaction opened by hand (`createQueryRunner()` plus
 * `startTransaction()`) use that runner or its manager, and end every
 * such transaction: work that waits 30 seconds (the module's
 * `waitTimeoutMs`) behind one open transaction is refused with
 * `DatabaseBusyError`. One contrast with PostgreSQL: inside a
 * `transaction()` callback, `dataSource.query()` (or a repository of the
 * data source, not of the callback's manager) joins the transaction on
 * SQLite, while on PostgreSQL it takes another connection of the pool
 * and runs outside it; use the callback's manager on both. Never
 * chamvi's own `AppToken.DATA_SOURCE`.
 */
export function dataSourceToken(name: string = DEFAULT_DATABASE_NAME): TypedToken<DataSource> {
    let token = dataSourceTokens.get(name);

    if (!token) {
        token = new TypedToken<DataSource>(`chamvi.database.${name}.data-source`);
        dataSourceTokens.set(name, token);
    }

    return token;
}

/** The container keys of an app's databases. */
export const DatabaseToken: DatabaseTokens = {
    DATA_SOURCE: dataSourceToken(),
    DESCRIPTORS: new TypedToken<DatabaseDescriptor>('chamvi.database.descriptors'),
};
