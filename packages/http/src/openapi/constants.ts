/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { resolveOpenApiDocumentPath } from './helpers.ts';

/** @internal The built document (`dist/swagger.json` of this package), see `resolveOpenApiDocumentPath()`. */
export const OPENAPI_DOCUMENT_PATH: string = resolveOpenApiDocumentPath();

/** @internal Where the document is served, under `basePath`. */
export const OPENAPI_DOCUMENT_ROUTE = '/openapi.json';

/** @internal Where the UI is mounted, under `basePath`. */
export const OPENAPI_UI_PATH = '/docs';

/** @internal The operation keys of an OpenAPI path item, lowercase as the documents write them. */
export const OPENAPI_OPERATION_METHODS: readonly string[] = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** @internal The operation key OpenAPI 3.2 adds. */
export const OPENAPI_QUERY_METHOD = 'query';

/** @internal Keys a merged document never takes as a name: they reach `Object.prototype` on a plain object. */
export const OPENAPI_RESERVED_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

/** @internal The OpenAPI 3.2 path-item field mapping further methods (as sent) to operations. */
export const OPENAPI_ADDITIONAL_OPERATIONS = 'additionalOperations';
