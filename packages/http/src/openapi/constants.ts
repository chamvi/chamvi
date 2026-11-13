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
