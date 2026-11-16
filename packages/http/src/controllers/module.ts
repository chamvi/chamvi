/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { decorators, getControllerRoutes } from '@routup/decorators';
import type { App } from 'routup';
import { RESERVED_ROUTE_SEGMENTS } from '../app/constants.ts';
import type { HttpAppOptions, HttpContext, HttpRoute } from '../app/types.ts';
import { readMetricsPath } from '../plugins/helpers.ts';
import { isAtOrUnder } from '../routes/helpers.ts';
import { readBasePaths, readControllerMeta } from './helpers.ts';

/**
 * Base paths outside the built-in routes, not at or above the metrics path,
 * with no extra route at or under them and not at or under an extra prefix
 * route; method paths routup can mount (listing them runs routup's own
 * registration), so an unservable path fails here and not at mount.
 */
export function validateControllers(options: HttpAppOptions, routes: HttpRoute[]): void {
    if (options.controllers === undefined) {
        return;
    }

    if (!Array.isArray(options.controllers)) {
        throw new InvalidAgentDefinitionError('controllers must be an array of controller instances.');
    }

    const metricsPath = readMetricsPath(options)?.toLowerCase();

    for (const controller of options.controllers) {
        const bases = readBasePaths(readControllerMeta(controller));

        for (const base of bases) {
            // routup matches paths case-insensitively
            const path = base.toLowerCase();
            const segment = path.split('/')[1] ?? '';

            if (RESERVED_ROUTE_SEGMENTS.includes(segment) || path === metricsPath) {
                throw new InvalidAgentDefinitionError(`Controller path "${base}" collides with a built-in route.`);
            }

            if (metricsPath !== undefined && isAtOrUnder(metricsPath, path)) {
                throw new InvalidAgentDefinitionError(`Controller path "${base}" covers the metrics path.`);
            }

            assertApart(base, routes);
        }

        try {
            getControllerRoutes(controller);
        } catch (error) {
            const paths = bases.map((base) => `"${base}"`).join(', ');
            const cause = Error.isError(error) ? error.message : String(error);

            throw new InvalidAgentDefinitionError(`Controller path${bases.length === 1 ? '' : 's'} ${paths} cannot be mounted: ${cause}`);
        }
    }
}

/**
 * Mounts the contributed controllers on `app`, behind the plugins and the
 * context handler and in front of the 404 and the error handler, as the
 * built-in ones; nothing for an empty list.
 */
export function registerControllers(app: App, ctx: HttpContext): void {
    if (ctx.controllers.length === 0) {
        return;
    }

    app.use(decorators({ controllers: ctx.controllers }));
}

/**
 * Controllers are mounted before the extra routes and every path both
 * could answer lies at or under one of their static paths: an extra route
 * at or under `base`, or a prefix route at or above it, is refused, for
 * any method (compared case-insensitively, as routup matches).
 */
function assertApart(base: string, routes: HttpRoute[]): void {
    const path = base.toLowerCase();

    for (const route of routes) {
        const other = route.path.toLowerCase();

        if (isAtOrUnder(other, path)) {
            throw new InvalidAgentDefinitionError(`Route "${route.method} ${route.path}" lies under the controller path "${base}".`);
        }

        if (route.prefix && isAtOrUnder(path, other)) {
            throw new InvalidAgentDefinitionError(`Controller path "${base}" lies under the prefix route "${route.path}".`);
        }
    }
}
