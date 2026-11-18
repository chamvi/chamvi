/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */


export type VectorStoreModuleOptions = {
    /**
     * The PostgreSQL database of the knowledge tables (a `postgres:` or
     * `postgresql:` URL); default `DATABASE_URL`, the database of chamvi's
     * store. `chamvi migration --database vector` reads `DATABASE_URL`
     * only.
     */
    url?: string;
};
