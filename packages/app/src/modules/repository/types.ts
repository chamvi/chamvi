/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DataSource } from 'typeorm';

export type StoreModuleOptions = {
    /** A Postgres URL; default `DATABASE_URL`. */
    url?: string;
    /** An initialized data source, shared by the database repositories and never destroyed. */
    dataSource?: DataSource;
};

/** Which optional aggregates a memory store keeps (each default `true`). */
export type MemoryStoreAggregates = {
    /** `false`: no connection repository, so `CONNECTION_REPOSITORY` and `CONNECTION_SERVICE` are not registered. */
    connections?: boolean;
    /** `false`: no conversation repository, so `CONVERSATION_REPOSITORY` and `CONVERSATION_SERVICE` are not registered. */
    conversations?: boolean;
};
