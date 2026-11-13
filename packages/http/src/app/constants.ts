/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Where `createHttpApp` puts the HttpContext in `event.store`, for the middleware classes; internal. */
export const HTTP_CONTEXT: unique symbol = Symbol('chamvi:http-context');

/** Bytes a REST or MCP request body may have. */
export const DEFAULT_BODY_LIMIT = 1_048_576;

/** How often an SSE stream polls the store for runs executing elsewhere. */
export const DEFAULT_STREAM_POLL_MS = 2_000;

/** Open SSE run streams plus waiting MCP `run_<agent>` calls an app holds at once. */
export const DEFAULT_MAX_OPEN_STREAMS = 1_000;

/** The `Retry-After` (seconds) of a stream refused over `stream.maxOpen`. */
export const STREAM_RETRY_AFTER_SECONDS = 5;

/** How long `/readyz` waits for the store. */
export const DEFAULT_READY_TIMEOUT_MS = 2_000;

/** Page size of `GET /runs`, MCP `list_runs` and state collection lists without `page[limit]`. */
export const DEFAULT_PAGE_LIMIT = 50;

/** Largest `page[limit]` a list accepts. */
export const MAX_PAGE_LIMIT = 100;

/** Requests per client and window before `429`. */
export const DEFAULT_RATE_LIMIT_MAX = 300;

/** The rate limit window. */
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

/** Where Prometheus scrapes, relative to `basePath`. */
export const DEFAULT_METRICS_PATH = '/metrics';

/** First path segments of the built-in routes: an extra route may not start with one. */
export const RESERVED_ROUTE_SEGMENTS: readonly string[] = [
    'agents',
    'authorization',
    'channels',
    'connection-types',
    'connections',
    'docs',
    'healthz',
    'mcp',
    'me',
    'openapi.json',
    'readyz',
    'runs',
    'schedules',
    'ui-pages',
];
