/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { StoreErrorCode } from '@chamvi/store';

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

/** A static path: one or more `/<segment>` of word characters, `.`, `~` and `-`, no trailing slash. */
export const STATIC_ROUTE_PATH = /^(?:\/[\w.~-]+)+$/;

/**
 * The optional rest group of a route that serves a path and everything
 * below it (`<path>{/*rest}` matches `<path>`, `<path>/` and `<path>/a/b`).
 */
export const REST_ROUTE_SUFFIX = '{/*rest}';

/** Where Prometheus scrapes, relative to `basePath`. */
export const DEFAULT_METRICS_PATH = '/metrics';

/** First path segments of the built-in routes: an extra route may not start with one. */
export const RESERVED_ROUTE_SEGMENTS: readonly string[] = [
    'agents',
    'authorization',
    'channels',
    'components',
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

/** `@chamvi/store-db`'s DatabaseUnavailableError, mapped by its code: http does not depend on the database package. */
export const DATABASE_UNAVAILABLE_CODE = 'database_unavailable';

/**
 * The storage errors (`@chamvi/store`, and the database's unavailability)
 * by code: each answers with its status and this fixed message, never the
 * error's own, which names the entity, an operation or a driver code.
 */
export const STORAGE_ERRORS: Readonly<Record<string, { status: number; message: string }>> = {
    [StoreErrorCode.ENTITY_NOT_FOUND]: { status: 404, message: 'The requested record was not found.' },
    [StoreErrorCode.ENTITY_CONFLICT]: { status: 409, message: 'The record conflicts with a stored record.' },
    [StoreErrorCode.ENTITY_RELATION_INVALID]: { status: 400, message: 'The record references a record that does not exist.' },
    [StoreErrorCode.ENTITY_INVALID]: { status: 400, message: 'The record holds a value that is not valid.' },
    [StoreErrorCode.ENTITY_QUERY_INVALID]: { status: 400, message: 'The request is not a valid query.' },
    [StoreErrorCode.ENTITY_DEADLOCK]: { status: 409, message: 'The write conflicted with a concurrent write; retry the request.' },
    [DATABASE_UNAVAILABLE_CODE]: { status: 503, message: 'The database is unavailable; retry the request.' },
};
