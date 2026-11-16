/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IAppEvent } from 'routup';
import { DEFAULT_METRICS_PATH, REST_ROUTE_SUFFIX } from '../app/constants.ts';
import type { HttpAppOptions, HttpRoute } from '../app/types.ts';
import { MCP_PATH } from '../mcp/constants.ts';
import { OPENAPI_UI_PATH } from '../openapi/constants.ts';

/** Where Prometheus scrapes, relative to `basePath`; `undefined` with `metrics: false`. */
export function readMetricsPath(options: HttpAppOptions): string | undefined {
    return options.metrics === false ?
        undefined :
        options.metrics?.metricsPath ?? DEFAULT_METRICS_PATH;
}

/**
 * `event.path` without the `basePath` prefix and trailing slashes,
 * lower-cased: routup matches paths case-insensitively, so every check
 * against a route path must too.
 */
export function routePath(event: IAppEvent, basePath: string): string {
    const path = event.path.toLowerCase();
    const base = basePath.toLowerCase();
    const relative = base && (path === base || path.startsWith(`${base}/`)) ?
        path.slice(base.length) :
        path;

    return relative.replace(/\/+$/, '') || '/';
}

/** `GET <basePath>/runs/:id/stream` and `/connections/:name/events`: minute-long SSE connections skew request timings. */
export function isStreamRequest(event: IAppEvent, basePath: string): boolean {
    return event.method === 'GET' && /^\/(?:runs\/[^/]+\/stream|connections\/[^/]+\/events)$/.test(routePath(event, basePath));
}

/** `/healthz`, `/readyz` and the metrics path (under `basePath`): never rate limited. */
export function isOperationalPath(event: IAppEvent, basePath: string, metricsPath: string): boolean {
    const path = routePath(event, basePath);

    return path === '/healthz' || path === '/readyz' || path === metricsPath.toLowerCase();
}

/** The route's path, or with `prefix` also anything below `path/` (both lower-cased). */
function matchesRoute(route: HttpRoute, path: string): boolean {
    const own = route.path.toLowerCase();

    return path === own || (route.prefix === true && path.startsWith(`${own}/`));
}

/** The matching route `registerRoutes` serves: every match is a prefix of `path`, so the longest is the most specific. */
function findRoute(routes: readonly HttpRoute[], path: string): HttpRoute | undefined {
    return routes.filter((route) => matchesRoute(route, path)).toSorted((a, b) => b.path.length - a.path.length)[0];
}

/** A request served by an extra route declared `rateLimit: false` (method and path, under `basePath`). */
export function isUnlimitedRoute(event: IAppEvent, basePath: string, routes: readonly HttpRoute[]): boolean {
    const route = findRoute(routes.filter((candidate) => candidate.method === event.method), routePath(event, basePath));

    return route?.rateLimit === false;
}

/** Every request that no route chamvi labels answered shares this label. */
const UNMATCHED_ROUTE_LABEL = '/_unmatched';

/** The method-less mounts by their path without `basePath`: no route is dispatched there. */
function mountLabel(path: string): string {
    if (path === MCP_PATH || path === OPENAPI_UI_PATH) {
        return path;
    }

    return path.startsWith(`${OPENAPI_UI_PATH}/`) ? `${OPENAPI_UI_PATH}/*` : UNMATCHED_ROUTE_LABEL;
}

/**
 * The `path` label of a request, read after its handlers ran: the metrics
 * path, else the pattern of the route routup dispatched (`event.route`)
 * without `basePath` and with a rest group as `/*` (`/runs/:id`,
 * `/channels/github/*`), else a fixed label of a method-less mount. Never
 * the request path: ids, keys and unknown paths cannot mint a series each.
 */
export function routeLabel(event: IAppEvent, basePath: string, metricsPath: string): string {
    const path = routePath(event, basePath);

    if (path === metricsPath.toLowerCase()) {
        return metricsPath;
    }

    if (event.route === undefined) {
        return mountLabel(path);
    }

    const pattern = basePath && event.route.path.startsWith(basePath) ?
        event.route.path.slice(basePath.length) || '/' :
        event.route.path;

    return pattern.endsWith(REST_ROUTE_SUFFIX) ?
        `${pattern.slice(0, -REST_ROUTE_SUFFIX.length)}/*` :
        pattern;
}
