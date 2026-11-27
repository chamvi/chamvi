/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { ErrorCode } from '@chamvi/errors';
import { PEER_START_RETRY_AFTER_SECONDS } from '../runs/constants.ts';

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

/** The status of a DatabaseUnavailableError: its code is not an `ErrorCode`, so `ERROR_CODE_TO_STATUS` does not hold it. */
export const DATABASE_UNAVAILABLE_STATUS = 503;

/**
 * The storage errors (`@chamvi/errors`' `Entity*Error`s, and the
 * database's unavailability) by code: each answers with this fixed
 * message, never the error's own, which names the entity, an operation
 * or a driver code. The status is the code's (`httpStatusFromCode`).
 */
export const STORAGE_ERRORS: Readonly<Record<string, string>> = {
    [ErrorCode.ENTITY_NOT_FOUND]: 'The requested record was not found.',
    [ErrorCode.ENTITY_CONFLICT]: 'The record conflicts with a stored record.',
    [ErrorCode.ENTITY_RELATION_INVALID]: 'The record references a record that does not exist.',
    [ErrorCode.ENTITY_INVALID]: 'The record holds a value that is not valid.',
    [ErrorCode.ENTITY_QUERY_INVALID]: 'The request is not a valid query.',
    [ErrorCode.ENTITY_DEADLOCK]: 'The write conflicted with a concurrent write; retry the request.',
    [DATABASE_UNAVAILABLE_CODE]: 'The database is unavailable; retry the request.',
};

/**
 * Expected, retryable refusals by error code: answered with this
 * `Retry-After` (seconds) and never reported to `onError`.
 */
export const RETRY_AFTER_SECONDS: Readonly<Record<string, number>> = { [ErrorCode.PEER_START_BUSY]: PEER_START_RETRY_AFTER_SECONDS };
