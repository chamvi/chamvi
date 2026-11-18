/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createApp, databaseModule } from '@chamvi/app';
import {
    KNOWLEDGE_VECTOR_DATABASE,
    KNOWLEDGE_VECTOR_ENTITIES,
    KNOWLEDGE_VECTOR_MIGRATIONS,
    KNOWLEDGE_VECTOR_MIGRATIONS_TABLE,
} from '../../../src/schema/index.ts';

// the app `chamvi migration --database vector` reads the knowledge vector schema from
export default createApp({
    agents: [],
    modules: [
        databaseModule({
            name: KNOWLEDGE_VECTOR_DATABASE,
            entities: KNOWLEDGE_VECTOR_ENTITIES,
            migrations: KNOWLEDGE_VECTOR_MIGRATIONS,
            migrationsTableName: KNOWLEDGE_VECTOR_MIGRATIONS_TABLE,
            migrationsDirectory: new URL('../../../src/migrations/', import.meta.url),
            postgres: true,
            installExtensions: false,
        }),
    ],
});
