/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { swaggerUI } from '@routup/swagger-ui';

export type OpenApiOptions = {
    /** Serve the Swagger UI at `<basePath>/docs`. Default: true. */
    ui?: boolean;
    /** @internal The document to serve, for specs. Default: the package's built `dist/swagger.json`. */
    documentPath?: string;
    /** @internal The UI plugin factory, for specs. Default: `swaggerUI` of `@routup/swagger-ui`. */
    swaggerUI?: typeof swaggerUI;
    /**
     * OpenAPI documents of the routes the app adds itself (its own
     * `@routup/decorators` controllers), generated with trapi and
     * `@routup/decorators/preset`, their paths relative to `basePath` like
     * chamvi's own. Their `paths`, `tags` and `components` are merged into
     * the served document; `info`, `servers` and every other top-level key
     * stay chamvi's. Paths merge per path and method; a method another
     * document already has, a different path-item field (`parameters`,
     * `summary`, ...) for the same path and a different definition of a
     * component name (`schemas`, `securitySchemes`, ...) are refused with
     * `InvalidAgentDefinitionError` at construction; an identical definition
     * is kept once. Tags merge by name, the first description wins.
     */
    documents?: object[];
};
