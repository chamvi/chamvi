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

/**
 * @internal The files the UI shell loads (relative to `<basePath>/docs/`):
 * everything else of swagger-ui-dist (its petstore demo page, the OAuth
 * redirect page, maps, README) answers 404.
 */
export const OPENAPI_UI_ASSETS: readonly string[] = [
    'favicon-16x16.png',
    'favicon-32x32.png',
    'swagger-ui-bundle.js',
    'swagger-ui-standalone-preset.js',
    'swagger-ui.css',
];
