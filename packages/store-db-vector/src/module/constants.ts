/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * Where `chamvi migration generate --database vector` writes, from this
 * package's sources (`src/migrations/`); only chamvi's own development
 * generates them.
 */
export const VECTOR_STORE_MIGRATIONS_DIRECTORY: URL = new URL('../migrations/', import.meta.url);
