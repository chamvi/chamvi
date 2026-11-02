/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Where `knowledgeRoutes()` serves, under the app's `basePath`. */
export const KNOWLEDGE_ROUTE_PATH = '/knowledge';

/** Lists and reads collections and documents. */
export const KNOWLEDGE_READ_PERMISSION = 'knowledge:read';

/** Creates, deletes and syncs collections and writes documents of managed ones. */
export const KNOWLEDGE_WRITE_PERMISSION = 'knowledge:write';

/** Documents per page when `page[limit]` is not given. */
export const KNOWLEDGE_DOCUMENTS_DEFAULT_LIMIT = 50;

/** The largest `page[limit]` of a document listing. */
export const KNOWLEDGE_DOCUMENTS_MAX_LIMIT = 100;
