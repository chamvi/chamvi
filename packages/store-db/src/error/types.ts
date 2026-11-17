/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** What kept a better-sqlite3 data source's connection: an open transaction, or an operation that has not returned. */
export type DatabaseBusyHolder = 'transaction' | 'operation';
