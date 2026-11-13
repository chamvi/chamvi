/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ChamviError } from '@chamvi/core';
import { swaggerUI } from '@routup/swagger-ui';
import { App, defineCoreHandler } from 'routup';
import type { HttpContext } from '../app/types.ts';
import { DOCUMENT_CACHE_CONTROL, STATIC_SECURITY_HEADERS } from '../static/constants.ts';
import { OPENAPI_DOCUMENT_PATH, OPENAPI_DOCUMENT_ROUTE, OPENAPI_UI_PATH } from './constants.ts';
import { buildOpenApiUiCsp, loadOpenApiDocument } from './helpers.ts';
import type { OpenApiOptions } from './types.ts';

/**
 * `GET <basePath>/openapi.json` and, unless `ui: false`, the Swagger UI at
 * `<basePath>/docs`, both unauthenticated. The document is read once; when
 * it is missing or not a JSON object nothing is mounted and `onError` gets
 * one report: documentation is no precondition for serving the API.
 */
export function registerOpenApiRoutes(app: App, ctx: HttpContext, options: OpenApiOptions): void {
    const path = options.documentPath ?? OPENAPI_DOCUMENT_PATH;
    const document = loadOpenApiDocument(path, ctx.basePath);

    if (!document) {
        ctx.onError(new ChamviError(`The OpenAPI document "${path}" is missing or not a JSON object, so ` +
            `${OPENAPI_DOCUMENT_ROUTE} and ${OPENAPI_UI_PATH} are not served; build @chamvi/http with "npm run build".`));

        return;
    }

    const content = JSON.stringify(document);

    // outside the UI's mount, which answers every path below it with its HTML shell
    app.get(OPENAPI_DOCUMENT_ROUTE, defineCoreHandler((event) => {
        event.response.headers.set('content-type', 'application/json; charset=utf-8');

        // routup sets the etag and answers a conditional request from it
        return content;
    }));

    if (options.ui === false) {
        return;
    }

    const ui = new App();
    // one entry per HTML body: the shell and the few pages of swagger-ui-dist
    const policies = new Map<string, string>();

    ui.use(defineCoreHandler(async (event) => {
        for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
            event.response.headers.set(name, value);
        }

        const response = await event.next();

        if (!response?.headers.get('content-type')?.startsWith('text/html')) {
            return response;
        }

        const html = await response.clone().text();
        let csp = policies.get(html);

        if (csp === undefined) {
            csp = buildOpenApiUiCsp(html);
            policies.set(html, csp);
        }

        response.headers.set('content-security-policy', csp);
        response.headers.set('cache-control', DOCUMENT_CACHE_CONTROL);

        return response;
    }));
    // the parsed document, the same object the JSON route serves: the plugin inlines it into its shell
    swaggerUI(document, {
        url: `${ctx.basePath}${OPENAPI_DOCUMENT_ROUTE}`,
        // no topbar (the shell hides it anyway): its logo carries an inline style the CSP refuses
        layout: 'BaseLayout',
        // no badge from validator.swagger.io
        validatorUrl: null,
    }).install(ui);
    app.use(OPENAPI_UI_PATH, ui);
}
