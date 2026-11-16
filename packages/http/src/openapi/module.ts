/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { swaggerUI } from '@routup/swagger-ui';
import { App, defineCoreHandler } from 'routup';
import type { HttpContext } from '../app/types.ts';
import { DOCUMENT_CACHE_CONTROL } from '../static/constants.ts';
import {
    OPENAPI_DOCUMENT_PATH,
    OPENAPI_DOCUMENT_ROUTE,
    OPENAPI_UI_PATH,
} from './constants.ts';
import { loadOpenApiDocument } from './helpers.ts';
import { mergeOpenApiDocuments } from './merge.ts';
import type { OpenApiOptions } from './types.ts';

/**
 * `GET <basePath>/openapi.json` and, unless `ui: false`, the Swagger UI at
 * `<basePath>/docs`, both unauthenticated. The document is read once; when
 * it is missing or not a JSON object nothing is mounted, and when the UI
 * cannot be mounted only the document is served; either way `onError` gets
 * one report: documentation is no precondition for serving the API. The
 * contributed `documents` are merged in first; a collision throws.
 */
export function registerOpenApiRoutes(app: App, ctx: HttpContext, options: OpenApiOptions): void {
    const path = options.documentPath ?? OPENAPI_DOCUMENT_PATH;
    const document = loadOpenApiDocument(path, ctx.basePath);

    if (!document) {
        ctx.onError(new InvalidAgentDefinitionError(`The OpenAPI document "${path}" is missing or not a JSON object, so ` +
            `${OPENAPI_DOCUMENT_ROUTE} and ${OPENAPI_UI_PATH} are not served; the published @chamvi/http ships it, ` +
            'a source checkout builds it with "npm run build".'));

        return;
    }

    // a collision with chamvi's own document throws: construction fails
    const served = options.documents && options.documents.length > 0 ?
        mergeOpenApiDocuments(document, options.documents)! :
        document;
    const content = JSON.stringify(served);

    // outside the UI's mount
    app.get(OPENAPI_DOCUMENT_ROUTE, defineCoreHandler((event) => {
        event.response.headers.set('content-type', 'application/json; charset=utf-8');

        // routup sets the etag and answers a conditional request from it
        return content;
    }));

    if (options.ui === false) {
        return;
    }

    const ui = new App();

    // the plugin answers GET and HEAD of its shell and files only, each with its recommended policy (`csp`)
    // and `nosniff`, `no-referrer` and `x-frame-options: DENY` (`securityHeaders`); everything else falls
    // through to the JSON 404, which stays as on any other path
    ui.use(defineCoreHandler(async (event) => {
        const response = await event.next();

        if (response?.headers.has('content-security-policy')) {
            response.headers.set('cache-control', DOCUMENT_CACHE_CONTROL);
            // `swagger-initializer.js` holds the document: no other origin may include it with `<script src>`
            response.headers.set('cross-origin-resource-policy', 'same-origin');
        }

        return response;
    }));

    const factory = options.swaggerUI ?? swaggerUI;

    // the plugin reads its template and resolves swagger-ui-dist synchronously: a broken install costs the UI, not the app
    try {
        // the parsed document, the same object the JSON route serves: the plugin escapes it into its initializer
        factory(served, {
            url: `${ctx.basePath}${OPENAPI_DOCUMENT_ROUTE}`,
            // no topbar: its logo carries an inline style the CSP refuses
            layout: 'BaseLayout',
            // no badge from validator.swagger.io
            validatorUrl: null,
            // own files only, no inline code, no framing; the document's server is relative, so nothing remote
            csp: true,
            securityHeaders: true,
        }).install(ui);
    } catch (error) {
        const reason = Error.isError(error) ? error.message : String(error);

        ctx.onError(new InvalidAgentDefinitionError(`The Swagger UI cannot be mounted, so ${OPENAPI_UI_PATH} is not served ` +
            `(${OPENAPI_DOCUMENT_ROUTE} is): ${reason}`));

        return;
    }

    app.use(OPENAPI_UI_PATH, ui);
}
