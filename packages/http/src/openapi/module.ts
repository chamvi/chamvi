/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { NotFoundError } from '@ebec/http';
import { swaggerUI } from '@routup/swagger-ui';
import { App, defineCoreHandler } from 'routup';
import type { HttpContext } from '../app/types.ts';
import { DOCUMENT_CACHE_CONTROL, STATIC_SECURITY_HEADERS } from '../static/constants.ts';
import {
    OPENAPI_DOCUMENT_PATH,
    OPENAPI_DOCUMENT_ROUTE,
    OPENAPI_UI_ASSETS,
    OPENAPI_UI_PATH,
} from './constants.ts';
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
        ctx.onError(new InvalidAgentDefinitionError(`The OpenAPI document "${path}" is missing or not a JSON object, so ` +
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
    const mount = `${ctx.basePath}${OPENAPI_UI_PATH}`;
    // computed once from the first full shell (a 200 GET): the plugin compiles it once, so its hashes never change
    let policy: string | undefined;

    ui.use(defineCoreHandler(async (event) => {
        // only the canonical casing: the plugin compiles its `<base href>` from the first request's mount path
        // (`/docs/` mounts as `/docs/`)
        const rest = event.mountPath.replace(/\/$/, '') === mount ? event.path.slice(mount.length) : undefined;
        const shell = rest === '' || rest === '/';

        if (rest === undefined || (!shell && !OPENAPI_UI_ASSETS.includes(rest.slice(1)))) {
            throw new NotFoundError({ message: 'The requested route does not exist.' });
        }

        for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
            event.response.headers.set(name, value);
        }

        const response = await event.next();

        if (!shell || !response) {
            return response;
        }

        // a HEAD answer has no body to hash
        if (policy === undefined && response.status === 200 && event.method === 'GET') {
            policy = buildOpenApiUiCsp(await response.clone().text());
        }

        // a 304 carries the same full policy (a browser merges it into its stored shell); before any
        // full shell none at all, so the stored one (same etag, same body) keeps its own
        if (policy !== undefined) {
            response.headers.set('content-security-policy', policy);
        }

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
