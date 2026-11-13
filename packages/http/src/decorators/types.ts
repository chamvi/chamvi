/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** The query vocabularies the OpenAPI document describes: runs list, kv list, collection read. */
export type QuerySchemaName = 'runs' | 'kv' | 'documents';

/** The non-JSON response bodies the OpenAPI document describes: an SSE stream, a download. */
export type ProducedMediaType = 'text/event-stream' | 'application/octet-stream';
