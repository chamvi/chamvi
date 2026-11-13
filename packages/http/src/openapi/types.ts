/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type OpenApiOptions = {
    /** Serve the Swagger UI at `<basePath>/docs`. Default: true. */
    ui?: boolean;
    /** @internal The document to serve, for specs. Default: the package's built `dist/swagger.json`. */
    documentPath?: string;
};
