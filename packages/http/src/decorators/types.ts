/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * The request parameters the OpenAPI document describes beyond the path:
 * runs list, kv list, collection read, and the run stream's resume point
 * (its `after` query and `Last-Event-ID` header).
 */
export type QuerySchemaName = 'runs' | 'kv' | 'documents' | 'stream';

