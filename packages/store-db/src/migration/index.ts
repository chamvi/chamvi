/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export {
    DATABASE_LOCK_PREFIX,
    MIGRATION_DATABASE_URL_VARIABLE,
    MIGRATION_OPERATIONS,
    STORE_DATABASE,
} from './constants.ts';
export { runMigrationOperation } from './module.ts';
export { isSameDatabase } from './same-database.ts';
export type { MigrationDescriptor, MigrationOperation, MigrationOperationInput } from './types.ts';
