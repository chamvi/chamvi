/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { RESERVED_ROUTE_SEGMENTS } from '../app/constants.ts';
import type { HttpAppOptions, HttpRoute } from '../app/types.ts';
import { readMetricsPath } from '../plugins/helpers.ts';
import { isAtOrUnder } from '../routes/helpers.ts';
import {
    joinControllerPath,
    readBasePaths,
    readControllerMeta,
    toRouteKey,
    toRouteMatcher,
} from './helpers.ts';
import type { ControllerRoute } from './types.ts';

/**
 * One route per base path and method of a controller instance, in that
 * order; a controller that is no decorated instance, or a base or method
 * path routup cannot serve, throws InvalidAgentDefinitionError.
 */
export function readControllerRoutes(controller: object): ControllerRoute[] {
    const meta = readControllerMeta(controller);
    const routes: ControllerRoute[] = [];

    for (const base of readBasePaths(meta)) {
        for (const options of Object.values(meta.methods)) {
            const method = options.method.toUpperCase();
            const path = joinControllerPath(method, base, options.url);

            routes.push({
                method,
                path,
                key: toRouteKey(path),
            });
        }
    }

    return routes;
}

/**
 * Base paths outside the built-in routes and not at or above the metrics
 * path; routes unique by method and key across every controller, matching
 * no extra route of the same method and not at or under its prefix route.
 */
export function validateControllers(options: HttpAppOptions, routes: HttpRoute[]): ControllerRoute[] {
    if (options.controllers === undefined) {
        return [];
    }

    if (!Array.isArray(options.controllers)) {
        throw new InvalidAgentDefinitionError('controllers must be an array of controller instances.');
    }

    const metricsPath = readMetricsPath(options)?.toLowerCase();
    const seen = new Set<string>();
    const result: ControllerRoute[] = [];

    for (const controller of options.controllers) {
        for (const base of readBasePaths(readControllerMeta(controller))) {
            // routup matches paths case-insensitively
            const path = base.toLowerCase();
            const segment = path.split('/')[1] ?? '';

            if (RESERVED_ROUTE_SEGMENTS.includes(segment) || path === metricsPath) {
                throw new InvalidAgentDefinitionError(`Controller path "${base}" collides with a built-in route.`);
            }

            if (metricsPath !== undefined && isAtOrUnder(metricsPath, path)) {
                throw new InvalidAgentDefinitionError(`Controller path "${base}" covers the metrics path.`);
            }
        }

        for (const route of readControllerRoutes(controller)) {
            const id = `${route.method} ${route.key}`;

            if (seen.has(id)) {
                throw new InvalidAgentDefinitionError(`Controller route "${route.method} ${route.path}" is registered twice.`);
            }

            seen.add(id);
            assertNotShadowing(route, routes);
            result.push(route);
        }
    }

    return result;
}

/**
 * Controllers are mounted before the extra routes: a controller route
 * matching an extra route's path, or at or under its prefix, would shadow it.
 */
function assertNotShadowing(route: ControllerRoute, routes: HttpRoute[]): void {
    const matcher = toRouteMatcher(route.path);

    for (const other of routes) {
        if (other.method !== route.method) {
            continue;
        }

        if (other.prefix) {
            if (isAtOrUnder(route.key, other.path.toLowerCase()) || matcher.test(other.path)) {
                throw new InvalidAgentDefinitionError(`Controller route "${route.method} ${route.path}" lies under the prefix route "${other.path}".`);
            }

            continue;
        }

        if (matcher.test(other.path)) {
            throw new InvalidAgentDefinitionError(`Controller route "${route.method} ${route.path}" collides with the route "${other.method} ${other.path}".`);
        }
    }
}
